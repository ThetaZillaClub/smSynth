import "server-only";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { NodeSSH } from "node-ssh";

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
const REMOTE_DATA = process.env.TRAIN_REMOTE_DATA_ROOT || "/mnt/data/datasets";

export async function GET(_req: NextRequest) {
  const script = `
set -euo pipefail
echo "whoami: $(whoami)"
echo "hostname: $(hostname)"
uname -a
echo "repo exists? $([ -d "${REMOTE_REPO}" ] && echo yes || echo no)"
echo -n "data writable? "
mkdir -p "${REMOTE_DATA}/_ping" && echo ok > "${REMOTE_DATA}/_ping/ok.txt" && echo "yes" || echo "no"
echo "which bash: $(command -v bash)"
echo "which curl: $(command -v curl)"
curl --version | head -n1 || true
# conda/python signal
if [ -f "/mnt/data1/miniconda3/etc/profile.d/conda.sh" ]; then
  source /mnt/data1/miniconda3/etc/profile.d/conda.sh || true
fi
if conda env list 2>/dev/null | grep -q -E '(^| )singer( |$)'; then
  echo "[conda] singer env present"
  conda run -n singer python -c "import sys, yaml; print('python:', sys.version.split()[0]); print('PyYAML OK')" || true
else
  echo "[conda] singer env missing"
fi
`;

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
    return Response.json({ ok: code === 0, code, stdout, stderr });
  } catch (e: any) {
    return new Response(`SSH ping failed: ${e?.message || String(e)}`, { status: 500 });
  } finally {
    try { ssh.dispose(); } catch {}
  }
}
