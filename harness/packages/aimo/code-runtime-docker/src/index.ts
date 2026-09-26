/**
 * Container-isolated Python code runtime (M1.5). Each run spawns
 * `docker run --rm -i --network none --read-only --memory/--cpus/--pids-limit
 * --tmpfs /tmp <image>` running the fd-1 JSON-lines bootstrap, and drives the
 * `dsh-code-runtime-python` wire protocol (boot/run/reply from the host;
 * boot-ack/call/log/done from the child). Model code is a hostile peer:
 * inbound frames are re-validated, output is byte-budgeted, and the container
 * is killed on wall-clock timeout or abort.
 * @module @deepseek-ai/dsh-aimo-code-runtime-docker
 */

import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  CodeRuntime,
  DUNDER_MEMBER,
  PORTABLE_RESERVED_WORDS,
  RESERVED_BINDING_GLOBALS,
  RESERVED_ERROR_MEMBERS,
} from '@deepseek-ai/dsh-code-runtime'
import type {
  CodeBindingNamespace,
  CodeJsonValue,
  CodeRunFailure,
  CodeRunRequest,
  CodeRunResult,
} from '@deepseek-ai/dsh-code-runtime'
import { checkDoneValue, validateChildFrame } from '@deepseek-ai/dsh-code-runtime-python'
import type { ReplyMessage } from '@deepseek-ai/dsh-code-runtime-python'

/** Every execution cap; changeable from cordis.yml. */
export interface Config {
  /** Docker image running the bootstrap (ENTRYPOINT python3 /opt/bootstrap.py). */
  image?: string
  /** `docker run --memory` (RSS cap); default 512m. Best-effort: some Docker
   *  Desktop configurations do not enforce the cgroup memory limit. */
  memory?: string
  /** In-process `RLIMIT_AS` address-space cap in bytes — the effective memory
   *  ceiling where `--memory` is not enforced; default 1 GiB. */
  maxAddressSpaceBytes?: number
  /** `docker run --cpus`; default 1. */
  cpus?: number
  /** `docker run --pids-limit`; default 64. */
  pidsLimit?: number
  /** CPU-time budget in ms → RLIMIT_CPU (seconds) inside the container. */
  computeMs?: number
  /** Wall-clock ceiling in ms; the host kills the container on expiry. */
  maxWallMs?: number
  /** Combined cap for captured logs + completion value + failure message. */
  maxOutputBytes?: number
  /** `docker run --stop-timeout` seconds: SIGTERM→SIGKILL grace on kill. */
  stopTimeoutSeconds?: number
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/
const MAX_TIMER_DELAY_MS = 2_147_483_647

/** One in-flight run, tracked for disposal. */
interface LiveRun {
  child: ChildProcess
  settle(failure: CodeRunFailure): void
  finished: Promise<void>
}

export class DockerCodeRuntime extends CodeRuntime {
  static Config: z<Config> = z.object({
    image: z.string().default('aimo-python-runtime:latest'),
    memory: z.string().default('512m'),
    maxAddressSpaceBytes: z.number().default(1_073_741_824),
    cpus: z.number().default(1),
    pidsLimit: z.number().default(64),
    computeMs: z.number().default(60_000),
    maxWallMs: z.number().default(300_000),
    maxOutputBytes: z.number().default(4_194_304),
    stopTimeoutSeconds: z.number().default(5),
  })

  readonly language = 'python'
  readonly isolation = 'container'

  private readonly config: Required<Config>
  private readonly live = new Set<LiveRun>()
  private disposed = false

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.config = config as Required<Config>
    for (const value of [this.config.computeMs, this.config.maxWallMs, this.config.maxOutputBytes, this.config.cpus, this.config.pidsLimit, this.config.stopTimeoutSeconds, this.config.maxAddressSpaceBytes]) {
      if (!(Number.isFinite(value) && value > 0)) throw new Error('dsh-aimo-code-runtime-docker: numeric config must be positive and finite')
    }
    if (this.config.maxWallMs > MAX_TIMER_DELAY_MS) throw new Error('dsh-aimo-code-runtime-docker: config.maxWallMs exceeds the setTimeout limit')
    ctx.effect(() => () => this.teardown(), 'aimo docker code-runtime teardown')
  }

  /** Dispose to quiescence: abort every in-flight run and await its container exit. */
  private async teardown(): Promise<void> {
    this.disposed = true
    const runs = [...this.live]
    for (const run of runs) run.settle({ kind: 'abort', message: 'runtime disposed' })
    await Promise.all(runs.map(run => run.finished))
  }

  /** Reject malformed binding globals / error classes as contract misuse. */
  private validateBindings(request: CodeRunRequest): Map<string, CodeBindingNamespace> {
    const bindings = new Map<string, CodeBindingNamespace>()
    for (const namespace of request.bindings) {
      if (!IDENTIFIER.test(namespace.global) || PORTABLE_RESERVED_WORDS.has(namespace.global) || RESERVED_BINDING_GLOBALS.has(namespace.global)) {
        throw new Error(`dsh-aimo-code-runtime-docker: unusable binding global ${JSON.stringify(namespace.global)}`)
      }
      if (bindings.has(namespace.global)) throw new Error(`dsh-aimo-code-runtime-docker: duplicate binding global ${JSON.stringify(namespace.global)}`)
      bindings.set(namespace.global, namespace)
    }
    const errorNames = new Set<string>()
    for (const namespace of request.bindings) {
      const d = namespace.errorClass
      if (!d) continue
      if (!IDENTIFIER.test(d.name) || PORTABLE_RESERVED_WORDS.has(d.name) || RESERVED_BINDING_GLOBALS.has(d.name)) {
        throw new Error(`dsh-aimo-code-runtime-docker: unusable binding error class ${JSON.stringify(d.name)}`)
      }
      if (bindings.has(d.name) || errorNames.has(d.name)) throw new Error(`dsh-aimo-code-runtime-docker: duplicate injected global ${JSON.stringify(d.name)}`)
      if (d.memberNameProperty.length === 0 || RESERVED_ERROR_MEMBERS.has(d.memberNameProperty) || DUNDER_MEMBER.test(d.memberNameProperty)) {
        throw new Error(`dsh-aimo-code-runtime-docker: unusable binding error member ${JSON.stringify(d.memberNameProperty)}`)
      }
      errorNames.add(d.name)
    }
    return bindings
  }

  async run(request: CodeRunRequest): Promise<CodeRunResult> {
    if (this.disposed) throw new Error('dsh-aimo-code-runtime-docker: run() after disposal')
    const bindings = this.validateBindings(request)
    if (request.signal?.aborted) return { logs: [], error: { kind: 'abort', message: String(request.signal.reason) } }

    const args = [
      'run', '--rm', '-i',
      '--network', 'none',
      '--read-only',
      '--memory', this.config.memory,
      '--cpus', String(this.config.cpus),
      '--pids-limit', String(this.config.pidsLimit),
      '--tmpfs', '/tmp',
      '--stop-timeout', String(this.config.stopTimeoutSeconds),
      this.config.image,
    ]
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })

    const send = (frame: object): void => { child.stdin.write(JSON.stringify(frame) + '\n') }
    const bootNamespaces = [...bindings].map(([global, ns]) => ({
      global,
      names: Object.keys(ns.functions),
      ...ns.errorClass ? { errorClass: ns.errorClass } : {},
    }))

    return new Promise<CodeRunResult>((resolve) => {
      let settled = false
      const answered = new Set<number>()
      const logs: string[] = []
      let logBytes = 2 // "[]"
      const out = this.config.maxOutputBytes
      let finalizeRef!: () => void
      const finished = new Promise<void>(done => { finalizeRef = done })

      const fail = (logsSnapshot: string[], error: CodeRunFailure): CodeRunResult => ({ logs: logsSnapshot, error })
      const overLimit = (logsSnapshot: string[]): CodeRunResult => fail(logsSnapshot, { kind: 'output-limit', message: `outer output exceeded ${out} bytes` })

      const finish = (make: () => CodeRunResult): void => {
        if (settled) return
        settled = true
        clearTimeout(wallTimer)
        request.signal?.removeEventListener('abort', onAbort)
        this.live.delete(live)
        const result = make()
        finalizeRef()
        resolve(result)
      }

      const admitLog = (text: string): boolean => {
        if (settled) return false
        const add = Buffer.byteLength(text, 'utf8') + (logs.length > 0 ? 1 : 0)
        if (logBytes + add > out) {
          finish(() => overLimit([...logs, text]))
          return false
        }
        logBytes += add
        logs.push(text)
        return true
      }

      const rl = createInterface({ input: child.stdout })
      rl.on('line', (line) => {
        if (settled) return
        let frame
        try { frame = validateChildFrame(JSON.parse(line)) } catch { return }
        if (frame === undefined) return

        if (frame.type === 'boot-ack') {
          send({ type: 'run', program: request.program })
        } else if (frame.type === 'log') {
          admitLog(frame.text)
        } else if (frame.type === 'call') {
          if (answered.has(frame.id)) return
          answered.add(frame.id)
          const reply = (payload: ReplyMessage): void => {
            if (settled) return
            try { send(payload) } catch { /* child gone */ }
          }
          const record = bindings.get(frame.global)?.functions
          const fn = record && Object.hasOwn(record, frame.name) ? record[frame.name] : undefined
          if (typeof fn !== 'function') {
            reply({ type: 'reply', id: frame.id, ok: false, message: `unknown binding ${JSON.stringify(`${frame.global}.${frame.name}`)}` })
            return
          }
          void (async () => {
            try {
              const value = await fn(frame.args)
              reply({ type: 'reply', id: frame.id, ok: true, value })
            } catch (error) {
              reply({ type: 'reply', id: frame.id, ok: false, message: error instanceof Error ? error.message : String(error) })
            }
          })()
        } else if (frame.type === 'done') {
          if (frame.error) {
            const error = frame.error
            finish(() => fail(logs, { kind: error.kind, message: error.message }))
            return
          }
          if (frame.value === undefined) {
            finish(() => ({ logs }))
            return
          }
          const checked = checkDoneValue(frame.value, out - logBytes)
          if (!checked.ok) {
            finish(() => checked.reason === 'non-lossless'
              ? fail(logs, { kind: 'invalid-output', message: 'program completion must be lossless JSON' })
              : overLimit(logs))
            return
          }
          finish(() => ({ logs, value: frame.value as CodeJsonValue }))
        }
      })

      // Bootstrap diagnostics / uncaught errors land on stderr as logs.
      child.stderr.on('data', (chunk: Buffer) => { admitLog(chunk.toString('utf8')) })

      child.on('error', (error) => { finish(() => fail(logs, { kind: 'worker-exit', message: `docker spawn failed: ${error.message}` })) })
      child.on('exit', (code, signal) => {
        if (settled) return
        finish(() => fail(logs, { kind: 'worker-exit', message: `python container exited before completing (code ${code ?? 'null'}, signal ${signal ?? 'null'})` }))
      })

      const wallTimer = setTimeout(() => {
        child.kill('SIGTERM')
        finish(() => fail(logs, { kind: 'timeout', message: `wall-clock ceiling reached (${this.config.maxWallMs}ms)` }))
      }, this.config.maxWallMs)
      const onAbort = (): void => {
        child.kill('SIGTERM')
        finish(() => fail(logs, { kind: 'abort', message: String(request.signal?.reason) }))
      }
      request.signal?.addEventListener('abort', onAbort, { once: true })

      const live: LiveRun = {
        child,
        finished,
        settle: (failure: CodeRunFailure) => { child.kill('SIGTERM'); finish(() => fail(logs, failure)) },
      }
      this.live.add(live)

      // Boot frame carries every cap and the namespace roster (protocol contract).
      send({
        type: 'boot',
        cpuSeconds: Math.max(1, Math.ceil(this.config.computeMs / 1000)),
        addressSpaceBytes: this.config.maxAddressSpaceBytes,
        maxLogBytes: this.config.maxOutputBytes,
        maxValueBytes: this.config.maxOutputBytes,
        namespaces: bootNamespaces,
      })
    })
  }
}

export default DockerCodeRuntime
