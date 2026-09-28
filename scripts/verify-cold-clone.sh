#!/usr/bin/env bash
# 冷启动验收：把本仓库当作一台新机器，从零 clone → 构建 → 校验插件组合。
#
# 这是打包的**唯一可信验收**：只读已提交的内容，不参考任何本地工作树状态。
#
# 用法：
#   ./scripts/verify-cold-clone.sh            # 全量：clone + pnpm install + build + typecheck + dump-config
#   ./scripts/verify-cold-clone.sh --quick    # 跳过 install/build（已有产物时只验组合）
#   KEEP=1 ./scripts/verify-cold-clone.sh     # 结束后保留临时目录，便于排查
#
# 前置：node 20+、pnpm。不需要真实 API key（只做 --dump-config，不发模型请求）。
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUICK=0
[ "${1:-}" = "--quick" ] && QUICK=1
KEEP="${KEEP:-0}"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/aimo-verify.XXXXXX")"
CLONE="$WORK/clone"
export DSH_HOME="$WORK/dsh-home"

cleanup() {
  if [ "$KEEP" = 1 ]; then echo "==> 保留临时目录：$WORK"; else rm -rf "$WORK"; fi
}
trap cleanup EXIT

fail() { echo "✗ $*" >&2; exit 1; }

echo "==> [1/6] 冷 clone：$REPO → $CLONE"
git clone --quiet "$REPO" "$CLONE"
cd "$CLONE"
echo "    HEAD: $(git log --oneline -1)"
[ -z "$(git status --porcelain)" ] || fail "clone 出来不干净（有未提交改动被带出？）"
echo "    ✓ 工作树干净"

echo "==> [2/6] 准备独立 DSH_HOME：$DSH_HOME"
mkdir -p "$DSH_HOME/profiles/web" "$DSH_HOME/profiles/node_modules/@deepseek-ai"
cp "$CLONE/project/config/cordis.patch.yml" "$DSH_HOME/profiles/web/cordis.patch.yml"
# 占位 key：dump-config 不会发请求，仅避免 setup 的交互提示
printf 'version: 1\n\nrefs:\n  DEEPSEEK_API_KEY: sk-cold-clone-placeholder\n' > "$DSH_HOME/.credentials.yaml"
chmod 600 "$DSH_HOME/.credentials.yaml"
echo "    ✓ profile patch 已就位"

if [ "$QUICK" = 0 ]; then
  echo "==> [3/6] pnpm install --frozen-lockfile（顺带验证 pnpm-lock 与 5 个插件一致）"
  ( cd "$CLONE/harness" && pnpm install --frozen-lockfile )
  echo "    ✓ lockfile 与工作区一致"

  echo "==> [4/6] pnpm run build（tsc -b tsconfig.host.json + tsdown）"
  ( cd "$CLONE/harness" && pnpm run build )
  echo "    ✓ 构建通过（含 5 个 aimo 包的 lib/ 产物）"

  echo "==> [5/6] pnpm run typecheck"
  ( cd "$CLONE/harness" && pnpm run typecheck )
  echo "    ✓ 类型/合约检查通过"
else
  echo "==> [3-5/6] --quick：跳过 install/build/typecheck"
fi

echo "==> [6/6] 插件符号链接 + --dump-config 组合校验"
link() { ln -sfn "$CLONE/harness/packages/$1" "$DSH_HOME/profiles/node_modules/@deepseek-ai/$2"; }
link "aimo/python"              "dsh-aimo-python"
link "aimo/verifier"            "dsh-aimo-verifier"
link "aimo/team-roles"          "dsh-aimo-team-roles"
link "aimo/pool"                "dsh-aimo-pool"
link "aimo/code-runtime-docker" "dsh-aimo-code-runtime-docker"
link "experimental/agent-team"      "dsh-experimental-agent-team"
link "experimental/tool-agent-team" "dsh-experimental-tool-agent-team"

DUMP="$( cd "$CLONE/harness" && pnpm dsh --profile web --dump-config 2>&1 )" || fail "--dump-config 失败：\n$DUMP"
echo "$DUMP" | grep -E "aimo|agent-team|code-runtime" | sed 's/^/    /' || true

for pkg in dsh-aimo-python dsh-aimo-verifier dsh-aimo-team-roles dsh-aimo-pool dsh-aimo-code-runtime-docker; do
  echo "$DUMP" | grep -q "$pkg" || fail "未挂载 $pkg"
done
echo "$DUMP" | grep -q "dsh-experimental-agent-team" || fail "未挂载 agent-team"
echo "    ✓ 5 个 aimo 插件 + agent-team 均已挂载"

echo
echo "==> 冷启动验收通过 ✓"
echo "    （沙箱镜像与真实解题未验：需 docker build + 真 key，见 README）"
