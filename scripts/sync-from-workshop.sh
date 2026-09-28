#!/usr/bin/env bash
# 从工坊实例同步「插件源码 / DSH 集成面 / 文档 / 研究资料 / 评测工程」到本仓库。
#
# 存在理由：本仓库的 harness/ 是 vendored 快照（不是 fork），日常开发都在工坊 clone 里进行；
# 没有这个脚本，两边就会像 2026-09-26 → 09-28 那样再次分叉（仓库里是 3 个插件的旧版，
# 工坊已经变成 5 个插件 + 重写过的 verifier）。
#
# 用法：
#   ./scripts/sync-from-workshop.sh            # 同步并打印 git status
#   ./scripts/sync-from-workshop.sh --check    # 只预览差异（rsync dry-run），不写任何文件
#   WORKSHOP=/path/to/clone AIMO_SRC=/path/to/AIMO ./scripts/sync-from-workshop.sh
#
# 环境变量：
#   WORKSHOP  工坊 clone（DSH 源码 + packages/aimo + work/）  默认 ../DeepSeek_Harness/deepseek-harness-aimo
#   AIMO_SRC  文档与评测的来源目录（含 MyProject/、Related_Works/）  默认 ../AIMO
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSHOP="${WORKSHOP:-$ROOT/../DeepSeek_Harness/deepseek-harness-aimo}"
AIMO_SRC="${AIMO_SRC:-$ROOT/../AIMO}"

CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

for d in "$WORKSHOP" "$AIMO_SRC"; do
  [ -d "$d" ] || { echo "找不到来源目录：$d（用 WORKSHOP= / AIMO_SRC= 指定）" >&2; exit 1; }
done

DRY=(); [ "$CHECK" = 1 ] && DRY=(--dry-run --itemize-changes)
EXCLUDES=(--exclude 'node_modules/' --exclude 'lib/' --exclude '*.tsbuildinfo'
          --exclude '.DS_Store' --exclude '__pycache__/' --exclude '.github/')

echo "==> 来源：WORKSHOP=$WORKSHOP"
echo "        AIMO_SRC=$AIMO_SRC"
[ "$CHECK" = 1 ] && echo "    （--check 模式：只预览，不写入）"

echo "==> 1/5 插件源码 → harness/packages/aimo/{python,verifier,team-roles,pool,code-runtime-docker}"
for p in python verifier team-roles pool code-runtime-docker; do
  mkdir -p "$ROOT/harness/packages/aimo/$p"
  rsync -a --delete "${DRY[@]}" "${EXCLUDES[@]}" \
    "$WORKSHOP/packages/aimo/$p/" "$ROOT/harness/packages/aimo/$p/"
done

echo "==> 2/5 DSH 集成面 → harness/{tsconfig.base.json,tsconfig.host.json,pnpm-lock.yaml}"
for f in tsconfig.base.json tsconfig.host.json pnpm-lock.yaml; do
  rsync -a "${DRY[@]}" "$WORKSHOP/$f" "$ROOT/harness/$f"
done

echo "==> 3/5 设计文档 → project/docs/"
rsync -a "${DRY[@]}" --exclude '.DS_Store' \
  --include '*.md' --exclude '*' "$AIMO_SRC/MyProject/" "$ROOT/project/docs/"

echo "==> 4/5 研究资料 → project/research/"
rsync -a "${DRY[@]}" --exclude '.DS_Store' "$AIMO_SRC/Related_Works/" "$ROOT/project/research/"
# PDF 只保留一份，统一留在 project/research/ 下
[ -f "$ROOT/project/research/AIMO3_Reference_Problems.pdf" ] || \
  cp "$AIMO_SRC/MyProject/AIMO3_Reference_Problems.pdf" "$ROOT/project/research/" 2>/dev/null || true

echo "==> 5/5 评测工程 → eval/（解题草稿 → eval/notes/aimo3-ref-02/）"
rsync -a "${DRY[@]}" --exclude '.DS_Store' --exclude 'notes/' --exclude '__pycache__/' \
  "$AIMO_SRC/MyProject/eval/" "$ROOT/eval/"
mkdir -p "$ROOT/eval/notes/aimo3-ref-02"
rsync -a --delete "${DRY[@]}" --exclude '__pycache__/' --exclude '.DS_Store' \
  "$WORKSHOP/work/" "$ROOT/eval/notes/aimo3-ref-02/"

if [ "$CHECK" = 1 ]; then
  echo
  echo "==> 预览结束（未写入）。去掉 --check 即执行同步。"
  exit 0
fi

# .github 是上游 CI/issue 管理，不进本仓库（副作用见 README「同步 / 合并上游」）
rm -rf "$ROOT/harness/.github"
find "$ROOT" -name '.DS_Store' -delete 2>/dev/null || true

echo
echo "==> 同步完成。当前差异："
git -C "$ROOT" status --short
echo
echo "提醒：插件 package.json 的 version 可能与 harness/package.json 不一致（现状 verifier 0.2.0-rc.0、"
echo "      team-roles/pool 0.1.0-rc.0 vs 根 0.1.1-rc.2）；跑 pnpm run constraints 前先确认这是有意为之。"
echo "验收：cd harness && pnpm install && pnpm run build && pnpm run typecheck"
