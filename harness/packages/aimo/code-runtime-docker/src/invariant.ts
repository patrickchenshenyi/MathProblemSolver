/**
 * No-op invariant companion: this package owns no durable session-event shapes.
 * @module @deepseek-ai/dsh-aimo-code-runtime-docker/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-aimo-code-runtime-docker'

export const name = 'aimo-code-runtime-docker-invariant'
export const inject = ['invariants']

const install: InvariantInstaller = Object.assign((_ctx: Context): void => {}, { inject: [] })

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
