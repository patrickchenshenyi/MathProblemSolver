# @deepseek-ai/dsh-aimo-code-runtime-docker

Container-isolated Python code runtime for the AIMO solver (M1.5). It is the
`ctx.codeRuntime` provider (`language: 'python'`, `isolation: 'container'`) that
replaces the temporary `run_python` tool: once this provider is mounted, the
tools' built-in Python Code Mode renderer generates `run_code` and the Python
SDK for free.

## How it runs

Each `run()` spawns:

```
docker run --rm -i --network none --read-only \
  --memory <memory> --cpus <cpus> --pids-limit <pidsLimit> \
  --tmpfs /tmp --stop-timeout <stopTimeoutSeconds> \
  <image>
```

The image (`AIMO/MyProject/docker/Dockerfile`, with sympy/numpy/mpmath) runs
`bootstrap.py`, which speaks the `dsh-code-runtime-python` JSON-lines wire
protocol on stdin (host → child) / stdout (child → host). The model program runs
as an async-function body with host bindings (`await tools.name(args)`) bridged
over that channel; its stdout/stderr are captured and forwarded as `log` frames.

## Config (cordis.yml)

| field | default | meaning |
|---|---|---|
| `image` | `aimo-python-runtime:latest` | Docker image (built from `MyProject/docker/`) |
| `memory` | `512m` | `docker run --memory` RSS cap |
| `cpus` | `1` | `docker run --cpus` |
| `pidsLimit` | `64` | `docker run --pids-limit` |
| `computeMs` | `60000` | CPU-time budget → `RLIMIT_CPU` (seconds) in the container |
| `maxWallMs` | `300000` | host wall-clock ceiling; the container is killed on expiry |
| `maxOutputBytes` | `4194304` | combined log/value/message cap |
| `stopTimeoutSeconds` | `5` | `docker run --stop-timeout` (SIGTERM→SIGKILL grace) |

## Model Experience

### Python Code Mode (`run_code`)

#### What the model sees

Nothing directly from this package: once `ctx.codeRuntime.language === 'python'`,
`dsh-tools` generates the `run_code` transport and the Python SDK (the exact
typed `tools` object) — see the [tool catalog](../../../docs/tool-catalog.md).

#### Token effect

Indirect, through the generated Code Mode SDK text.

#### KV Cache effect

Indirect; the generated SDK is prefix-stable for an unchanged visible tool set.

## Known Limitations and Deferred Work

- **fd-1 transport** — the wire uses stdin/stdout (docker exposes three fds), not
  the seam's canonical fd-3 channel; the frame vocabulary is unchanged.
- **No CPU-timeout frame** — `RLIMIT_CPU` terminates the process on CPU-budget
  expiry, which the host reports as `worker-exit` (substrate death) rather than a
  clean `timeout`; the wall-clock budget is the clean `timeout`.
- **Binding results are not lossless-JSON validated host-side** — the reply
  round-trips through `JSON.stringify`; non-JSON resolutions may degrade rather
  than fail loudly (tighten with `snapshotJsonValue` if needed).
