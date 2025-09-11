// app/api/models/[modelId]/infer/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { NodeSSH } from "node-ssh";

export const runtime = "nodejs";

// ---- SSH env (same as queue/ping) ----
const SSH_HOST = process.env.TRAIN_SSH_HOST!;
const SSH_PORT = Number(process.env.TRAIN_SSH_PORT || 22);
const SSH_USER = process.env.TRAIN_SSH_USER || "root";
const SSH_PASSPHRASE = process.env.TRAIN_SSH_PASSPHRASE || undefined;

function readPrivateKey(): string {
  const raw = process.env.TRAIN_SSH_KEY;
  const b64 = process.env.TRAIN_SSH_KEY_B64;
  if (raw && raw.includes("\\n")) return raw.replace(/\\n/g, "\n");
  if (raw && raw.startsWith("-----BEGIN")) return raw;
  if (b64) return Buffer.from(b64, "base64").toString("utf8");
  throw new Error("TRAIN_SSH_KEY or TRAIN_SSH_KEY_B64 must be set");
}

// ---- Inference command template & paths ----
const INFER_CMD_TEMPLATE = process.env.INFER_CMD ?? "";
const REMOTE_DATA = (process.env.TRAIN_REMOTE_DATA_ROOT || "/mnt/data1/datasets").replace(/\/+$/, "");
const REPO = "/mnt/data1/repos/Prompt-Singer";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuidV4 = (s: string) => UUID_V4.test(s);
const sq = (s: string) => `'${s.replace(/'/g, `'"'"'`)}'`;

// Writes a remote file with here-doc safely (no need for sftp)
async function writeRemoteFile(ssh: NodeSSH, absPath: string, content: string) {
  const script = `
set -euo pipefail
mkdir -p "$(dirname ${sq(absPath)})"
cat > ${sq(absPath)} <<'EOF___CODES'
${content}
EOF___CODES
`;
  const res = await ssh.execCommand(script);
  if (res.code !== 0) throw new Error(res.stderr || res.stdout || "Failed writing remote file");
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await ctx.params; // Next 15: params is a promise
  if (!isUuidV4(modelId)) {
    return NextResponse.json({ ok: false, error: "Invalid model id" }, { status: 400 });
  }
  if (!INFER_CMD_TEMPLATE) {
    return NextResponse.json({ ok: false, error: "Inference not configured (set INFER_CMD)" }, { status: 501 });
  }

  // We support either:
  //  - { codesTxt: "int int int ..." }
  //  - { codesMulti: ["int int ...", "int int ...", ...] }
  //  (If you post {text}, we’ll return 501 for now.)
  let body: { text?: string; codesTxt?: string; codesMulti?: string[]; sessionId?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  if (body.text && !body.codesTxt && !body.codesMulti) {
    return NextResponse.json({
      ok: false,
      error: "This repo requires *codec codes* for inference. Provide 'codesTxt' or 'codesMulti'. (Text→codes adapter is not in this branch.)",
    }, { status: 501 });
  }

  const sessionId = body.sessionId ?? null;
  if (sessionId && !isUuidV4(sessionId)) {
    return NextResponse.json({ ok: false, error: "Invalid session id" }, { status: 400 });
  }

  // Connect SSH
  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: SSH_HOST,
      port: SSH_PORT,
      username: SSH_USER,
      privateKey: readPrivateKey(),
      passphrase: SSH_PASSPHRASE,
      tryKeyboard: false,
      readyTimeout: 30000,
      keepaliveInterval: 10000,
    });

    // Locate checkpoint (prefer best, else last)
    const root = `${REMOTE_DATA}/${modelId}`;
    const finder = sessionId ? `
set -e
if [ -f "${root}/${sessionId}/ckpts/checkpoint_best.pt" ]; then
  echo "${root}/${sessionId}/ckpts/checkpoint_best.pt"
elif [ -f "${root}/${sessionId}/ckpts/checkpoint_last.pt" ]; then
  echo "${root}/${sessionId}/ckpts/checkpoint_last.pt"
fi
` : `
set -e
BEST=$(find "${root}" -maxdepth 3 -type f -name 'checkpoint_best.pt' -printf '%T@ %p\\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2-)
if [ -n "$BEST" ]; then
  echo "$BEST"
else
  LAST=$(find "${root}" -maxdepth 3 -type f -name 'checkpoint_last.pt' -printf '%T@ %p\\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2-)
  if [ -n "$LAST" ]; then echo "$LAST"; fi
fi
`;
    const fnd = await ssh.execCommand(finder);
    if (fnd.code !== 0) return NextResponse.json({ ok: false, error: fnd.stderr || fnd.stdout || "Failed to locate checkpoint" }, { status: 404 });
    const ckpt = (fnd.stdout || "").trim();
    if (!ckpt || !ckpt.startsWith(root + "/")) return NextResponse.json({ ok: false, error: "No checkpoint found." }, { status: 404 });

    // Prepare input code file
    const tmpDir = `${root}/.infer`;
    const codeFile = `${tmpDir}/codes-${Date.now()}.txt`;
    if (body.codesTxt) {
      // single stream
      await writeRemoteFile(ssh, codeFile, body.codesTxt.trim());
    } else if (Array.isArray(body.codesMulti) && body.codesMulti.length > 0) {
      // multi-stream: write as N lines, one line per codebook stream
      await writeRemoteFile(ssh, codeFile, body.codesMulti.map(s => s.trim()).join("\n"));
    } else {
      return NextResponse.json({ ok: false, error: "Provide codesTxt (space-separated ints) or codesMulti (array of such strings)." }, { status: 400 });
    }

    // Where WAV will land
    const outDir = tmpDir;
    const outPath = `${outDir}/out-${Date.now()}.wav`;

    // Build command
    const cmd = INFER_CMD_TEMPLATE
      .replaceAll("{CKPT}", ckpt)
      .replaceAll("{REPO}", REPO)
      .replaceAll("{OUT_DIR}", outDir)
      .replaceAll("{CODE_FILE}", codeFile);

    // Run and echo the produced wav path if exists (infer.py writes to output_dir)
    const runner = `
set -euo pipefail
mkdir -p ${sq(outDir)}
${cmd}
# pick newest wav in outDir
LATEST=$(ls -t ${sq(outDir)}/*.wav 2>/dev/null | head -n1 || true)
if [ -n "$LATEST" ]; then
  echo "$LATEST"
fi
`;
    const runRes = await ssh.execCommand(runner);
    if (runRes.code !== 0) {
      return NextResponse.json({ ok: false, error: runRes.stderr || runRes.stdout || "Inference failed" }, { status: 500 });
    }
    const produced = (runRes.stdout || "").trim();
    if (!produced || !produced.endsWith(".wav")) {
      return NextResponse.json({ ok: false, error: "No WAV produced (check code file format expected by wave_generation/infer.py)." }, { status: 500 });
    }

    // Stream WAV back
    const client: any = (ssh as any).connection;
    const nodeStream: any = await new Promise((resolve, reject) => {
      client.exec(`bash -lc ${sq(`cat ${sq(produced)}`)}`, (err: any, ch: any) => {
        if (err) return reject(err);
        ch.stderr?.on("data", (d: Buffer) => {
          const s = d.toString();
          if (/No such file|Permission denied|Input\/output error/i.test(s)) {
            try { ch.close(); } catch {}
            reject(new Error(s.trim()));
          }
        });
        resolve(ch);
      });
    });

    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk: Buffer) => controller.enqueue(chunk));
        nodeStream.on("close", () => controller.close());
        nodeStream.on("end", () => controller.close());
        nodeStream.on("error", (err: any) => controller.error(err));
      },
      cancel() {
        try { nodeStream.destroy(); } catch {}
      },
    });

    const headers = new Headers();
    headers.set("Content-Type", "audio/wav");
    headers.set("Content-Disposition", `inline; filename="${modelId}-infer.wav"`);

    return new NextResponse(webStream, { headers });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  } finally {
    try { ssh.dispose(); } catch {}
  }
}
