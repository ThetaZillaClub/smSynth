// app/api/models/[modelId]/latest-ckpt/route.ts
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

const REMOTE_DATA = (process.env.TRAIN_REMOTE_DATA_ROOT || "/mnt/data1/datasets").replace(/\/+$/, "");

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuidV4 = (s: string) => UUID_V4.test(s);

// safe single-quote for bash
const sq = (s: string) => `'${s.replace(/'/g, `'"'"'`)}'`;

export async function GET(req: NextRequest, ctx: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await ctx.params; // async params fix
  if (!isUuidV4(modelId)) {
    return NextResponse.json({ ok: false, error: "Invalid model id" }, { status: 400 });
  }
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (sessionId && !isUuidV4(sessionId)) {
    return NextResponse.json({ ok: false, error: "Invalid session id" }, { status: 400 });
  }

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

    const root = `${REMOTE_DATA}/${modelId}`;

    // Prefer checkpoint_best, fallback to checkpoint_last
    const finder = sessionId
      ? `
set -e
if [ -f "${root}/${sessionId}/ckpts/checkpoint_best.pt" ]; then
  echo "${root}/${sessionId}/ckpts/checkpoint_best.pt"
elif [ -f "${root}/${sessionId}/ckpts/checkpoint_last.pt" ]; then
  echo "${root}/${sessionId}/ckpts/checkpoint_last.pt"
fi
`
      : `
set -e
BEST=$(find "${root}" -maxdepth 3 -type f -name 'checkpoint_best.pt' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2-)
if [ -n "$BEST" ]; then
  echo "$BEST"
else
  LAST=$(find "${root}" -maxdepth 3 -type f -name 'checkpoint_last.pt' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2-)
  if [ -n "$LAST" ]; then echo "$LAST"; fi
fi
`;

    const { code, stdout, stderr } = await ssh.execCommand(finder);
    if (code !== 0) {
      return NextResponse.json({ ok: false, error: stderr || stdout || "Failed to locate checkpoint" }, { status: 404 });
    }
    const remoteCkpt = stdout.trim();
    if (!remoteCkpt || !remoteCkpt.startsWith(root + "/")) {
      return NextResponse.json({ ok: false, error: "No checkpoint found." }, { status: 404 });
    }

    // Use raw ssh exec stream: cat file -> pipe to web response
    const client: any = (ssh as any).connection;
    if (!client) throw new Error("SSH connection not available");

    const nodeStream: any = await new Promise((resolve, reject) => {
      client.exec(`bash -lc ${sq(`cat ${sq(remoteCkpt)}`)}`, (err: any, ch: any) => {
        if (err) return reject(err);
        ch.stderr?.on("data", (d: Buffer) => {
          // If cat errors, fail early
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
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="${modelId}-checkpoint.pt"`);

    return new NextResponse(webStream, { headers });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  } finally {
    try { ssh.dispose(); } catch {}
  }
}
