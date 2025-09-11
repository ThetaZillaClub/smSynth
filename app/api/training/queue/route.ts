// app/api/training/queue/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { NodeSSH } from "node-ssh";

export const runtime = "nodejs";

type Body = {
  bucket: string;
  basePath: string;                 // "<modelId>/<sessionId>"
  tsvKey: string;                   // "<modelId>/<sessionId>/dataset.tsv"
  wavKeys: string[];                // ["<modelId>/<sessionId>/wavs/xxx.wav", ...]
  modelId: string;                  // uuid v4
  sessionId: string;                // uuid v4
  subjectId?: string | null;
  genderLabel?: "male" | "female" | null;
};

// ---- Env (mirrors your ping route) ----
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

const REMOTE_REPO = process.env.TRAIN_REMOTE_REPO_DIR || "/mnt/data1/repos/Prompt-Singer";
const REMOTE_DATA = process.env.TRAIN_REMOTE_DATA_ROOT || "/mnt/data1/datasets";
const AUTO_START =
  String(process.env.AUTO_START || "1").toLowerCase() === "1" ||
  String(process.env.AUTO_START || "").toLowerCase() === "true";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---- helpers ----
function invariant(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? "Invariant failed");
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuidV4 = (s: string) => UUID_V4.test(s);

const remoteBase = (modelId: string, sessionId: string) =>
  `${REMOTE_DATA.replace(/\/+$/,"")}/${modelId}/${sessionId}`;

// ensure BASE starts with REMOTE_DATA and ends in uuid/uuid
function isSafeBase(base: string) {
  const root = REMOTE_DATA.replace(/\/+$/,"").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${root}/[0-9a-f-]+/[0-9a-f-]+$`, "i");
  return re.test(base);
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

// ---- route ----
export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("Invalid JSON body");
  }

  const { bucket, basePath, tsvKey, wavKeys, modelId, sessionId } = body ?? {};
  try {
    invariant(bucket, "bucket required");
    invariant(basePath, "basePath required");
    invariant(tsvKey, "tsvKey required");
    invariant(Array.isArray(wavKeys) && wavKeys.length > 0, "wavKeys required");
    invariant(modelId && isUuidV4(modelId), "modelId must be UUID v4");
    invariant(sessionId && isUuidV4(sessionId), "sessionId must be UUID v4");
    invariant(basePath === `${modelId}/${sessionId}`, "basePath must be '<modelId>/<sessionId>'");
    invariant(tsvKey.startsWith(`${basePath}/`), "tsvKey must live under basePath");
    wavKeys.forEach((k) => invariant(k.startsWith(`${basePath}/wavs/`), "wavKeys must live under basePath/wavs/"));
  } catch (e: any) {
    return bad(e.message);
  }

  const BASE = remoteBase(modelId, sessionId);
  if (!isSafeBase(BASE)) return bad("Invalid base path");

  // --- Sign storage files (short TTL; GPU pulls immediately) ---
  const signables = [tsvKey, ...wavKeys];
  const { data: signed, error } = await supabaseAdmin
    .storage
    .from(bucket)
    .createSignedUrls(signables, 60 * 30); // 30 minutes

  if (error) return bad(`Failed to sign storage URLs: ${error.message}`, 500);

  const signedArr = (signed ?? []) as Array<{ path: string; signedUrl: string | null }>;
  if (signedArr.length !== signables.length) {
    return bad(`Signed URL count mismatch (${signedArr.length} !== ${signables.length})`, 500);
  }

  const requireUrl = (u: string | null, key: string) => {
    if (!u) throw new Error(`Missing signed URL for ${key}`);
    return u;
  };

  let tsvSigned: string;
  let wavsSigned: { key: string; url: string }[];
  try {
    tsvSigned = requireUrl(signedArr[0]?.signedUrl ?? null, tsvKey);
    wavsSigned = wavKeys.map((k, i) => ({
      key: k,
      url: requireUrl(signedArr[i + 1]?.signedUrl ?? null, k),
    }));
  } catch (e: any) {
    return bad(String(e), 500);
  }

  // --- Build remote bash script ---
  const remoteVars = [
    `REPO="${REMOTE_REPO}"`,
    `BASE="${BASE}"`,
    `JOBDIR="$REPO/data/jobs/${modelId}/${sessionId}"`,
    'SAVE_DIR="$BASE/ckpts"',
    'TB_DIR="$BASE/tb"',
  ].join("\n");

  const pyFallback = "\\${PYTHONPATH:-}"; // keep literal for bash

  const fetchLines = [
    `mkdir -p "$BASE/wavs" "$SAVE_DIR" "$TB_DIR"`,
    `curl -fL --retry 3 -o "$BASE/dataset.tsv" '${tsvSigned}'`,
    ...wavsSigned.map(({ key, url }) => {
      const name = key.split("/").pop()!;
      return `curl -fL --retry 3 --create-dirs -o "$BASE/wavs/${name}" '${url}'`;
    }),
    // --- FIX 1: ensure /mnt/data/datasets resolves to /mnt/data1/datasets
    `mkdir -p /mnt/data`,
    `ln -sfn "${REMOTE_DATA.replace(/\/+$/,"")}" "/mnt/data/datasets" || true`,
    // --- FIX 2: sanitize TSV audio_path -> point at the wavs we just pulled
    // If header has "audio_path", rewrite that column to "$BASE/wavs/<basename>"
    // Fallback: also replace absolute /mnt/data/datasets with our REMOTE_DATA root.
    `awk -vFS='\\t' -vOFS='\\t' -v base="$BASE" 'NR==1{ap=0; for(i=1;i<=NF;i++) if($i=="audio_path") ap=i; print; next} { if(ap){ n=$ap; sub(/^.*\\//,"",n); $ap=base "/wavs/" n } print }' "$BASE/dataset.tsv" > "$BASE/dataset.tsv.tmp" && mv "$BASE/dataset.tsv.tmp" "$BASE/dataset.tsv"`,
    `sed -i 's|/mnt/data/datasets|${REMOTE_DATA.replace(/\/+$/,"")}|g' "$BASE/dataset.tsv" || true`,
  ];

  const trainLines = [
    '# link jobdir inside repo (what your training code expects)',
    'mkdir -p "$(dirname "$JOBDIR")"',
    'ln -sfn "$BASE" "$JOBDIR"',
    "",
    "# clean any previous run",
    'if [ -f "$BASE/train.pid" ]; then',
    '  if ps -p "$(cat "$BASE/train.pid")" >/dev/null 2>&1; then',
    '    kill "$(cat "$BASE/train.pid")" || true',
    "  fi",
    '  rm -f "$BASE/train.pid"',
    "fi",
    'rm -f "$BASE/train.log" "$BASE/train.fg.log" || true',
    "",
    "# launch detached; write PID; keep logs",
    'nohup fairseq-train --task t2a_sing_t5_config_task "$JOBDIR" \\',
    '  --num-workers 0 --save-dir "$SAVE_DIR" --tensorboard-logdir "$TB_DIR" \\',
    "  --arch acoustic_lm_global300M_noprefix --no-epoch-checkpoints \\",
    "  --criterion acoustic_language_modeling_cross_entropy \\",
    '  --optimizer adam --adam-betas "(0.9, 0.95)" --weight-decay 0.01 --clip-norm 0.0 \\',
    "  --lr 0.0005 --lr-scheduler inverse_sqrt --warmup-updates 4000 --warmup-init-lr 1e-07 \\",
    "  --tokens-per-sample 15000 --max-tokens 15000 --update-freq 16 \\",
    '  --fp16 --n-ctx 15000 --user-dir "$REPO/research" \\',
    "  --validate-interval 1 --best-checkpoint-metric loss \\",
    "  --patience 3 --max-epoch 50 \\",
    '  > "$BASE/train.log" 2>&1 < /dev/null &',
    "",
    'echo $! > "$BASE/train.pid"',
    "disown || true",
    'printf "started:%s\\n" "$(cat "$BASE/train.pid")"',
  ];

  const script = [
    "set -euo pipefail",
    remoteVars,
    'echo "[queue] base: $BASE"',
    'echo "[queue] repo: $REPO"',
    "",
    // env & conda
    'if [ -f "/mnt/data1/miniconda3/etc/profile.d/conda.sh" ]; then',
    '  source /mnt/data1/miniconda3/etc/profile.d/conda.sh',
    "fi",
    "conda activate singer",
    "export PYTHONUNBUFFERED=1",
    `export PYTHONPATH="$REPO/research:${pyFallback}"`,
    "",
    // fetch + fixups
    ...fetchLines,
    "",
    AUTO_START ? trainLines.join("\n") : 'echo "uploaded_only:1"',
  ].join("\n");

  const b64 = Buffer.from(script, "utf8").toString("base64");
  const cmd = `bash -lc "echo '${b64}' | base64 -d | bash"`;

  // --- SSH exec ---
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
    });
    const { code, stdout, stderr } = await ssh.execCommand(cmd);

    if (code !== 0) {
      return NextResponse.json(
        { ok: false, error: `GPU start failed: ${stderr || stdout}` },
        { status: 500 }
      );
    }

    const started = /started:(\d+)/.test(stdout);
    const pid = (stdout.match(/started:(\d+)/)?.[1]) ?? "";
    return NextResponse.json({
      ok: true,
      started,
      jobId: pid,
      remoteDir: BASE,
      stdout,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: `SSH error: ${e?.message || String(e)}` },
      { status: 500 }
    );
  } finally {
    try { ssh.dispose(); } catch {}
  }
}
