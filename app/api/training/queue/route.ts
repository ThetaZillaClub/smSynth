import "server-only";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { NodeSSH } from "node-ssh";
import { createClient } from "@supabase/supabase-js";

type Body = {
  bucket: string;
  basePath: string;
  tsvKey: string;
  wavKeys: string[];
  modelId: string | null;
  subjectId: string | null;
  genderLabel: "male" | "female" | null;
  sessionId: string;
};

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
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
  throw new Error("TRAIN_SSH_KEY or TRAIN_SSH_KEY_B64 must be set to your private key contents");
}

const REMOTE_REPO = process.env.TRAIN_REMOTE_REPO_DIR || "/mnt/data1/repos/Prompt-Singer";
const REMOTE_DATA = process.env.TRAIN_REMOTE_DATA_ROOT || "/mnt/data/datasets";
const CODEC_CKPT  = process.env.TRAIN_CODEC_CKPT || "";
const NUMQ        = Number(process.env.TRAIN_NUMQ || 8);
const AUTO_START  = Number(process.env.AUTO_START || 0) === 1;

function bad(msg: string, code = 400) {
  return new Response(msg, { status: code });
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }

  const { bucket, basePath, tsvKey, wavKeys, modelId, subjectId, genderLabel, sessionId } = body;
  if (!bucket || !basePath || !tsvKey || !Array.isArray(wavKeys)) {
    return bad("Missing fields");
  }

  // 1) Sign Supabase URLs (2h)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const keys = [tsvKey, ...wavKeys];
  const { data: signed, error: signErr } = await admin.storage.from(bucket).createSignedUrls(keys, 2 * 60 * 60);
  if (signErr) return bad(`Sign error: ${signErr.message}`, 500);

  const urlByPath = new Map(signed?.map((e) => [e.path, e.signedUrl]) || []);
  const tsvUrl = urlByPath.get(tsvKey);
  if (!tsvUrl) return bad("No signed TSV URL", 500);

  const wavPairs = wavKeys.map((k) => {
    const u = urlByPath.get(k);
    if (!u) throw new Error(`Missing signed URL for ${k}`);
    return { name: k.split("/").pop()!, url: u };
  });

  // 2) Stage on node via SSH
  const jobId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const remoteDir = `${REMOTE_DATA}/${jobId}`;
  const trainLog  = `${remoteDir}/train.log`;

  // Pre-escape any single-quotes in URLs/names for safe bash single-quoted strings
  const tsvUrlSafe = tsvUrl.replace(/'/g, "'\\''");
  const wavListLines: string[] = [];
  wavListLines.push("WAV_URLS=()");
  wavListLines.push("WAV_NAMES=()");
  for (const p of wavPairs) {
    const uSafe = p.url.replace(/'/g, "'\\''");
    const nSafe = p.name.replace(/'/g, "'\\''");
    wavListLines.push(`WAV_URLS+=( '${uSafe}' ); WAV_NAMES+=( '${nSafe}' );`);
  }

  const phones = ["SP","IY","EY","IH","EH","AE","AH","AA","AO","OW","UW","AY","AW","OY","ER"];

  // Build the bash script as lines to avoid template/backtick pitfalls
  const L: string[] = [];
  L.push("set -euo pipefail");
  L.push(`mkdir -p "${remoteDir}/wavs"`);
  L.push(`echo "[+] Staging at ${remoteDir}"`);
  L.push(`TSV_URL='${tsvUrlSafe}'`);
  L.push(...wavListLines);
  L.push(`WAV_COUNT=${wavPairs.length}`);
  L.push(`echo "[+] Download dataset.tsv"`);
  L.push(`curl -fL --retry 3 -o "${remoteDir}/dataset.tsv" "$TSV_URL"`);
  L.push(`if [ "$WAV_COUNT" -gt 0 ]; then`);
  L.push(`  echo "[+] Download WAVs ($WAV_COUNT)"`);
  L.push(`  for i in $(seq 0 $(($WAV_COUNT-1))); do`);
  L.push(`    url="\${WAV_URLS[$i]}"; name="\${WAV_NAMES[$i]}";`);
  L.push(`    curl -fL --retry 3 -o "${remoteDir}/wavs/$name" "$url"`);
  L.push(`  done`);
  L.push(`else`);
  L.push(`  echo "[i] No WAVs to download"`);
  L.push(`fi`);
  L.push(`echo "[+] Check files"`);
  L.push(`test -s "${remoteDir}/dataset.tsv" || (echo "dataset.tsv missing" && exit 2)`);
  L.push(`ls -l "${remoteDir}/wavs" | sed -n '1,5p' || true`);

  // Repo sync (optional if present)
  L.push(`if [ -d "${REMOTE_REPO}" ]; then`);
  L.push(`  echo "[+] Sync dict/config in ${REMOTE_REPO}"`);
  L.push(`  cd "${REMOTE_REPO}"`);
  L.push(`  python - <<'PY'`);
  L.push(`import yaml`);
  L.push(`phones = ${JSON.stringify(phones)}`);
  L.push(`for path in ("data/dict_uni.txt","infer_tsv/dict_uni.txt"):`);
  L.push(`    with open(path,"r+",encoding="utf-8") as f:`);
  L.push(`        lines=f.read().splitlines()`);
  L.push(`        have=set(l.split()[0] for l in lines if l.strip())`);
  L.push(`        miss=[p for p in phones if p not in have]`);
  L.push(`        if miss:`);
  L.push(`            lines.extend([f"{p} 1" for p in miss])`);
  L.push(`            f.seek(0); f.write("\\n".join(lines).rstrip()+"\\n"); f.truncate()`);
  L.push(`length=sum(1 for _ in open("data/dict_uni.txt",encoding="utf-8"))`);
  L.push(`cfg_path="data/config.yaml"`);
  L.push(`cfg=yaml.safe_load(open(cfg_path,encoding="utf-8")) or {}`);
  L.push(`cfg["dict_length"]=length`);
  L.push(`cfg["audio_tokenizer_ckpt_path"]="${CODEC_CKPT}"`);
  L.push(`cfg["num_coarse_quantizers"]=${NUMQ}`);
  L.push(`yaml.safe_dump(cfg, open(cfg_path,"w",encoding="utf-8"), sort_keys=False)`);
  L.push(`print("[OK] dict_length", length)`);
  L.push(`PY`);
  L.push(`else`);
  L.push(`  echo "[i] Repo not found at ${REMOTE_REPO}; skipping config sync"`);
  L.push(`fi`);

  // Job metadata
  L.push(`cat > "${remoteDir}/JOB.json" <<JSON`);
  L.push(`{`);
  L.push(`  "job_id": "${jobId}",`);
  L.push(`  "model_id": ${JSON.stringify(modelId)},`);
  L.push(`  "subject_id": ${JSON.stringify(subjectId)},`);
  L.push(`  "gender_label": ${JSON.stringify(genderLabel)},`);
  L.push(`  "session_id": "${sessionId}",`);
  L.push(`  "dataset": { "tsv": "${remoteDir}/dataset.tsv", "wav_dir": "${remoteDir}/wavs" },`);
  L.push(`  "repo": "${REMOTE_REPO}"`);
  L.push(`}`);
  L.push(`JSON`);

  if (AUTO_START) {
    L.push(`echo "[+] Start training (background)"`);
    L.push(`if [ -f "/mnt/data1/miniconda3/etc/profile.d/conda.sh" ]; then`);
    L.push(`  source /mnt/data1/miniconda3/etc/profile.d/conda.sh || true`);
    L.push(`fi`);
    L.push(`conda activate singer || true`);
    L.push(`cd "${REMOTE_REPO}"`);
    // NOTE: You will replace the echo below with your actual training command later
    L.push(`nohup bash -lc '`);
    L.push(`  set -e`);
    L.push(`  echo "Training TODO: insert your fairseq command here; read ${remoteDir}/dataset.tsv"`);
    L.push(`' > "${trainLog}" 2>&1 &`);
    L.push(`echo $! > "${remoteDir}/train.pid"`);
    L.push(`echo "[OK] PID $(cat "${remoteDir}/train.pid")"`);
  } else {
    L.push(`echo "[i] AUTO_START=0, not starting training"`);
  }

  L.push(`echo "[DONE] ${remoteDir}"`);

  const script = L.join("\n");
  const b64 = Buffer.from(script, "utf8").toString("base64");
  const cmd = `bash -lc "echo '${b64}' | base64 -d | bash"`;

  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: SSH_HOST,
      port: SSH_PORT,
      username: SSH_USER,
      privateKey: readPrivateKey(),
      passphrase: SSH_PASSPHRASE,
      tryKeyboard: false,
      readyTimeout: 20000,
    });

    const { code, stdout, stderr } = await ssh.execCommand(cmd);
    if (code !== 0) {
      throw new Error(
        `[queue][code=${code}] stderr:\n${stderr || "(empty)"}\nstdout:\n${stdout || "(empty)"}`
      );
    }
  } catch (e: any) {
    try { ssh.dispose(); } catch {}
    return new Response(`SSH failed: ${e?.message || String(e)}`, { status: 500 });
  }
  try { ssh.dispose(); } catch {}

  return Response.json({
    ok: true,
    jobId,
    remoteDir,
    trainLog: AUTO_START ? trainLog : undefined,
    started: AUTO_START || false,
  });
}
