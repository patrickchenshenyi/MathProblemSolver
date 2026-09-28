#!/usr/bin/env bash
# 冷启动验收：把本仓库当作一台新机器，从零 clone → 构建 → 校验插件组合。
#
# 这是打包的**唯一可信验收**：只读已提交的内容，不参考任何本地工作树状态。
#
# 用法：
#   ./scripts/verify-cold-clone.sh                       # 全量：clone + pnpm install + build + typecheck + dump-config
#   ./scripts/verify-cold-clone.sh --reuse-harness=<dir>  # 跳过 install/build，用已构建好的 harness 只验组合断言
#   KEEP=1 ./scripts/verify-cold-clone.sh                # 结束后保留临时目录，便于排查
#
# 前置：node 20+、pnpm。不需要真实 API key（只做 --dump-config，不发模型请求）。
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REUSE_HARNESS=""
case "${1:-}" in
  "") ;;
  --reuse-harness=*) REUSE_HARNESS="${1#*=}" ;;
  *) echo "未知参数：$1（可用 --reuse-harness=<dir>）" >&2; exit 2 ;;
esac
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

echo "==> [1b/6] 脚本自检：\$VAR 后紧跟非 ASCII 字符会被 bash 并入变量名（须写成 \${VAR}）"
node -e '
const fs = require("node:fs"), path = require("node:path");
const files = fs.readdirSync("scripts").filter((f) => f.endsWith(".sh")).map((f) => path.join("scripts", f));
files.push("project/setup.sh");
const re = /\$[A-Za-z_][A-Za-z0-9_]*(?=[^\x00-\x7f])/g;
let bad = 0;
for (const f of files) {
  fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    const m = line.match(re);
    if (m) { bad++; console.error(`    ${f}:${i + 1} ${m.join(", ")}`); }
  });
}
process.exit(bad ? 1 : 0);
' || fail "脚本里有 \$VAR 紧跟非 ASCII 的写法（全角括号/冒号也算），请改成 \${VAR}"
echo "    ✓ 无风险写法"

# 默认用 clone 里的 harness；--reuse-harness 时用外部已构建的 harness（迭代断言时省时间）
HARNESS="$CLONE/harness"
if [ -n "$REUSE_HARNESS" ]; then
  HARNESS="$(cd "$REUSE_HARNESS" && pwd)"
  [ -d "$HARNESS/node_modules" ] || fail "--reuse-harness=$REUSE_HARNESS 里没有 node_modules（未构建）"
  echo "    注意：插件链接指向 ${HARNESS}（外部），非 clone 内"
fi

echo "==> [2/6] 准备独立 DSH_HOME：$DSH_HOME"
mkdir -p "$DSH_HOME/profiles/web" "$DSH_HOME/profiles/node_modules/@deepseek-ai"
cp "$CLONE/project/config/cordis.patch.yml" "$DSH_HOME/profiles/web/cordis.patch.yml"
# 占位 key：dump-config 不会发请求，仅避免 setup 的交互提示
printf 'version: 1\n\nrefs:\n  DEEPSEEK_API_KEY: sk-cold-clone-placeholder\n' > "$DSH_HOME/.credentials.yaml"
chmod 600 "$DSH_HOME/.credentials.yaml"
echo "    ✓ profile patch 已就位"

if [ -z "$REUSE_HARNESS" ]; then
  echo "==> [3/6] pnpm install --frozen-lockfile（顺带验证 pnpm-lock 与 5 个插件一致）"
  ( cd "$HARNESS" && pnpm install --frozen-lockfile )
  echo "    ✓ lockfile 与工作区一致"

  echo "==> [4/6] pnpm run build（tsc -b tsconfig.host.json + tsdown）"
  ( cd "$HARNESS" && pnpm run build )
  echo "    ✓ 构建通过（含 5 个 aimo 包的 lib/ 产物）"

  echo "==> [5/6] pnpm run typecheck"
  ( cd "$HARNESS" && pnpm run typecheck )
  echo "    ✓ 类型/合约检查通过"
else
  echo "==> [3-5/6] --reuse-harness：跳过 install/build/typecheck"
fi

echo "==> [6/6] 插件符号链接 + --dump-config 组合校验"
link() { ln -sfn "$HARNESS/packages/$1" "$DSH_HOME/profiles/node_modules/@deepseek-ai/$2"; }
link "aimo/python"              "dsh-aimo-python"
link "aimo/verifier"            "dsh-aimo-verifier"
link "aimo/team-roles"          "dsh-aimo-team-roles"
link "aimo/pool"                "dsh-aimo-pool"
link "aimo/code-runtime-docker" "dsh-aimo-code-runtime-docker"
link "experimental/agent-team"      "dsh-experimental-agent-team"
link "experimental/tool-agent-team" "dsh-experimental-tool-agent-team"

DUMPFILE="$WORK/dump-config.yml"
( cd "$HARNESS" && pnpm dsh --profile web --dump-config ) > "$DUMPFILE" 2>"$WORK/dump-config.err" \
  || { cat "$WORK/dump-config.err" >&2; fail "--dump-config 失败"; }
echo "    已 dump 到 ${DUMPFILE}（$(wc -l < "$DUMPFILE" | tr -d ' ') 行）"

# 6a) base 的代码运行时必须被禁用（否则 ctx.codeRuntime 单例冲突）
if awk '/^- id: code-runtime$/{f=1;next} f&&/^- /{exit} f' "$DUMPFILE" | grep -q 'disabled: true'; then
  echo "    ✓ code-runtime 已 disabled（容器后端接管 ctx.codeRuntime）"
else
  fail "code-runtime 未被 disabled —— profile patch 没生效"
fi

# 6b) 5 个 aimo 插件逐个挂载（数量也钉死，防止漏挂或重复）
for pkg in dsh-aimo-python dsh-aimo-verifier dsh-aimo-team-roles dsh-aimo-pool dsh-aimo-code-runtime-docker; do
  n=$(grep -c "name: '@deepseek-ai/$pkg'" "$DUMPFILE" || true)
  [ "$n" = 1 ] || fail "未挂载（或重复挂载）${pkg}：name 出现 $n 次"
done
echo "    ✓ 5 个 aimo 插件各挂载 1 次"

# 6c) 两个 experimental 依赖
for pkg in dsh-experimental-agent-team dsh-experimental-tool-agent-team; do
  grep -q "name: '@deepseek-ai/$pkg'" "$DUMPFILE" || fail "未挂载 $pkg"
done
echo "    ✓ agent-team / tool-agent-team 已挂载"

echo "    已挂载的 aimo 行："
grep -n "name: '@deepseek-ai/dsh-aimo" "$DUMPFILE" | sed 's/^/      /'

echo
echo "==> 冷启动验收通过 ✓"
echo "    （未验：docker build 沙箱镜像、真实 API key 解题。见 README）"
