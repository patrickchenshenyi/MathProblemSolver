#!/usr/bin/env bash
# 从工坊实例同步「插件源码 / DSH 集成面 / 文档 / 研究资料 / 评测工程」到本仓库。
#
# 存在理由：本仓库的 harness/ 是 vendored 快照（不是 fork），日常开发都在工坊 clone 里进行；
# 没有这个脚本，两边就会像 2026-09-26 → 09-28 那样再次分叉（仓库里是 3 个插件的旧版，
# 工坊已经变成 5 个插件 + 重写过的 verifier）。
#
# 用法：
#   ./scripts/sync-from-workshop.sh            # 同步并打印 git status（权威结果）
#   ./scripts/sync-from-workshop.sh --check    # 只预览（rsync dry-run），不写任何文件
#   WORKSHOP=/path/to/clone AIMO_SRC=/path/to/AIMO ./scripts/sync-from-workshop.sh
#
# ⚠️ 关于 --check 的可信度：macOS 自带的 `rsync` 是 **openrsync**（`rsync --version` 会显示
#    "openrsync: protocol version 29"），它不保证实现 GNU rsync 的 `--checksum`，且 itemize
#    输出会**多报**（校验和完全相同的文件也报成要传输）。所以：
#      · --check 的输出只能当提示，不能当结论；
#      · 真实差异以「同步后的 `git status --short`」为准（git 比的是内容）；
#      · --check 结尾会另外跑一次基于 `diff -rq` 的插件面权威比对。
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
  [ -d "$d" ] || { echo "找不到来源目录：${d}（用 WORKSHOP= / AIMO_SRC= 指定）" >&2; exit 1; }
done

DRY=(); [ "$CHECK" = 1 ] && DRY=(--dry-run --itemize-changes)
EXCLUDES=(--exclude 'node_modules/' --exclude 'lib/' --exclude '*.tsbuildinfo'
          --exclude '.DS_Store' --exclude '__pycache__/' --exclude '.github/')

echo "==> 来源：WORKSHOP=$WORKSHOP"
echo "        AIMO_SRC=$AIMO_SRC"
[ "$CHECK" = 1 ] && echo "    （--check 模式：只预览，不写入）"

echo "==> 1/6 插件源码 → harness/packages/aimo/{python,verifier,team-roles,pool,code-runtime-docker}"
for p in python verifier team-roles pool code-runtime-docker; do
  mkdir -p "$ROOT/harness/packages/aimo/$p"
  rsync -a --no-perms --delete -c "${DRY[@]}" "${EXCLUDES[@]}" \
    "$WORKSHOP/packages/aimo/$p/" "$ROOT/harness/packages/aimo/$p/"
done

echo "==> 2/6 DSH 集成面 → harness/{tsconfig.base.json,tsconfig.host.json,pnpm-lock.yaml}"
for f in tsconfig.base.json tsconfig.host.json pnpm-lock.yaml; do
  rsync -a --no-perms -c "${DRY[@]}" "$WORKSHOP/$f" "$ROOT/harness/$f"
done

echo "==> 3/6 设计文档 → project/docs/"
rsync -a --no-perms -c "${DRY[@]}" --exclude '.DS_Store' \
  --include '*.md' --exclude '*' "$AIMO_SRC/MyProject/" "$ROOT/project/docs/"

echo "==> 4/6 研究资料 → project/research/"
rsync -a --no-perms -c "${DRY[@]}" --exclude '.DS_Store' "$AIMO_SRC/Related_Works/" "$ROOT/project/research/"
# PDF 只保留一份，统一留在 project/research/ 下
[ -f "$ROOT/project/research/AIMO3_Reference_Problems.pdf" ] || \
  cp "$AIMO_SRC/MyProject/AIMO3_Reference_Problems.pdf" "$ROOT/project/research/" 2>/dev/null || true

echo "==> 5/6 评测工程 → eval/（解题草稿与复算脚本 → eval/notes/aimo3-ref-02/）"
# 排除仓库自有/已打补丁的脚本：来源侧那几份硬编码了工坊绝对路径（CLONE_ROOT / DSH_HOME / PDF），
# 仓库版已改为环境变量 + 仓库内相对路径。若被同步覆盖，可移植性修复会被悄悄回退。
rsync -a --no-perms -c "${DRY[@]}" --exclude '.DS_Store' --exclude 'notes/' --exclude '__pycache__/' \
  --exclude 'run-baseline.mjs' --exclude 'run-phase2-check.mjs' --exclude 'run-phase4.mjs' \
  --exclude 'build-aimo3-dataset.py' \
  "$AIMO_SRC/MyProject/eval/" "$ROOT/eval/"
mkdir -p "$ROOT/eval/notes/aimo3-ref-02"
# 注意：这一步**不用 --delete**。notes 的内容来自两个源（工坊 work/ 与 clone 根层 *.py），
# 加 --delete 会把下一条 rsync 刚收进来的根层脚本反向删掉；而且 notes 是证据归档，
# 宁可留下历史副本，也不要静默删除。
rsync -a --no-perms -c "${DRY[@]}" --exclude '__pycache__/' --exclude '.DS_Store' \
  "$WORKSHOP/work/" "$ROOT/eval/notes/aimo3-ref-02/"
# 工坊 clone 根目录下的求解/复算脚本也不该漏（它们不在 work/ 里）：只取根层 *.py。
rsync -a --no-perms -c "${DRY[@]}" --include='/*.py' --exclude='*' \
  "$WORKSHOP/" "$ROOT/eval/notes/aimo3-ref-02/"

echo "==> 6/6 人工判定项（本脚本**不会**自动同步）"
for d in "$AIMO_SRC/Showcase"; do
  if [ -d "$d" ]; then
    echo "    ⚠ $d 存在（$(find "$d" -maxdepth 1 -type f -not -name '.DS_Store' | wc -l | tr -d ' ') 个文件）"
    echo "      内含求职/申请材料（简历条目、面谈准备）与作品集 → 公开仓库不入，需你逐项决定后再手动 cp"
  fi
done

if [ "$CHECK" = 1 ]; then
  echo
  echo "==> 插件面权威比对（diff -rq，不受 openrsync 多报影响）"
  plugin_diff=0
  for p in python verifier team-roles pool code-runtime-docker; do
    out=$(diff -rq \
      -x node_modules -x lib -x '*.tsbuildinfo' -x '.DS_Store' \
      "$WORKSHOP/packages/aimo/$p" "$ROOT/harness/packages/aimo/$p" 2>&1) || true
    if [ -n "$out" ]; then plugin_diff=1; echo "    packages/aimo/$p:"; echo "$out" | sed 's/^/      /'; fi
  done
  [ "$plugin_diff" = 0 ] && echo "    ✓ 5 个插件源码与工坊逐字节一致"
  echo
  echo "    （上面的 rsync 预览在本机 openrsync 下会多报；真实差异以同步后的 git status 为准）"
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
echo "提醒：pnpm run constraints / hygiene 是上游发布门禁，对 private 工坊包必然失败"
echo "      （private: true、缺 publishConfig.access、peerDeps 指向 experimental，"
echo "        加上 verifier/team-roles/pool 与根包版本不一致）。这不是本次同步引入的问题。"
echo "验收：./scripts/verify-cold-clone.sh"
echo "      （install --frozen-lockfile → build → typecheck → dump-config 断言插件组合）"
