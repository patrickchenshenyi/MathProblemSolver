#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HARNESS="$ROOT/harness"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"

echo "==> 检查前置 ..."
command -v node   >/dev/null 2>&1 || { echo "缺少 node（需 20+）"; exit 1; }
command -v pnpm   >/dev/null 2>&1 || { echo "缺少 pnpm"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "缺少 docker"; exit 1; }

echo "==> 构建 harness（pnpm install + build）..."
(cd "$HARNESS" && pnpm install && pnpm run build)

echo "==> 构建沙箱镜像 aimo-python-runtime:latest ..."
docker build -t aimo-python-runtime:latest "$ROOT/project/docker"

echo "==> 初始化 DSH_HOME：$DSH_HOME ..."
mkdir -p "$DSH_HOME/profiles/web" "$DSH_HOME/profiles/node_modules/@deepseek-ai"

# profile patch
cp "$ROOT/project/config/cordis.patch.yml" "$DSH_HOME/profiles/web/cordis.patch.yml"

# credentials（已存在则跳过，不覆盖）
if [ ! -f "$DSH_HOME/.credentials.yaml" ]; then
  read -rsp "DeepSeek API key（sk-…）：" KEY; echo
  cat > "$DSH_HOME/.credentials.yaml" <<EOF
version: 1

refs:
  DEEPSEEK_API_KEY: $KEY
EOF
  chmod 600 "$DSH_HOME/.credentials.yaml"
  echo "已写入 $DSH_HOME/.credentials.yaml"
fi

# 插件符号链接（5 个；其余依赖由 dsh 首次启动自动 heal）
link() { ln -sfn "$HARNESS/packages/$1" "$DSH_HOME/profiles/node_modules/@deepseek-ai/$2"; }
link "aimo/python"               "dsh-aimo-python"
link "aimo/verifier"             "dsh-aimo-verifier"
link "aimo/code-runtime-docker"  "dsh-aimo-code-runtime-docker"
link "experimental/agent-team"       "dsh-experimental-agent-team"
link "experimental/tool-agent-team"  "dsh-experimental-tool-agent-team"

echo
echo "==> 完成。启动："
echo "    cd \"$HARNESS\" && pnpm dsh web"
echo "    （首次启动会自动补齐其余依赖符号链接；默认 http://127.0.0.1:3080）"
