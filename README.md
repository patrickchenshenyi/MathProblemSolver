# AIMO Math Solver

基于 DeepSeek Harness（DSH）的数学题求解器：deepseek-v4-pro + Python 工具（sympy）+ 强验收器 + 多 agent 协作，解 AIME/AIMO 型整数答案题。

本仓库是**自包含**的——DSH 源码、本项目插件、沙箱镜像、配置模板都在里面。`git clone` 后无需再拉取 DSH 上游，只需提供 API key 即可重建。

## 目录

| 路径 | 内容 |
|---|---|
| `harness/` | DSH 源码 + 本项目插件（`packages/aimo/{python,verifier,code-runtime-docker}`） |
| `project/docker/` | 模型代码沙箱镜像（`Dockerfile` + `bootstrap.py`，预装 sympy/numpy/mpmath） |
| `project/config/cordis.patch.yml` | profile patch（加载 5 个插件 + 关闭 base 代码运行时） |
| `project/setup.sh` | 一键重建脚本 |
| `project/docs/` | 设计文档（蓝图 / 实现计划 / 验收器 / 部署指南） |

## 前置

- Node.js 20+（推荐 22 LTS）
- pnpm
- Docker（Linux 装 Docker Engine；macOS 装 Docker Desktop）
- 一个 DeepSeek API key（有额度）

## 一键重建

```sh
./project/setup.sh
```

依次执行：检查前置 → `harness` 内 `pnpm install && pnpm run build` → 构建沙箱镜像 `aimo-python-runtime:latest` → 初始化 `~/.dsh`（写 patch、提示输入 API key、建 5 个插件符号链接）→ 打印启动命令。

然后启动：

```sh
cd harness && pnpm dsh web
```

默认打开 `http://127.0.0.1:3080`。

## 手动重建（等价步骤）

```sh
# 1) 构建 harness
cd harness && pnpm install && pnpm run build

# 2) 沙箱镜像
docker build -t aimo-python-runtime:latest ../project/docker

# 3) 配置 DSH_HOME
mkdir -p ~/.dsh/profiles/web ~/.dsh/profiles/node_modules/@deepseek-ai
cp ../project/config/cordis.patch.yml ~/.dsh/profiles/web/cordis.patch.yml
#    + 建 ~/.dsh/.credentials.yaml（见下）+ 5 个插件符号链接（见 setup.sh）

# 4) 启动
pnpm dsh web
```

## API key

key **不入库**。写入 `~/.dsh/.credentials.yaml`：

```yaml
version: 1

refs:
  DEEPSEEK_API_KEY: sk-你的key
```

## 更新

拉取新代码后：`cd harness && pnpm install && pnpm run build`；若插件/配置有变化，重跑 `./project/setup.sh`（幂等，会跳过已存在的凭据）。

## 备注

- 5 个插件（`aimo-python` / `aimo-verifier` / `aimo-code-runtime-docker` / `agent-team` / `tool-agent-team`）通过 `$DSH_HOME/profiles/node_modules` 符号链接解析；其余 ~200 个依赖符号链接由 `dsh` 首次启动自动 heal。
- DSH 上游更新可自行合并（`cd harness && git remote add upstream <dsh> && git fetch upstream && git merge`），但插件建立在特定版本上，合并前先在 `harness` 内验证。
- 本仓库的 `origin` 需要你自己 push 到一个远程（私有 GitHub/GitLab），否则重装电脑后无法"拉取"重建。
