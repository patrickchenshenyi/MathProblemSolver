/**
 * No-op invariant companion. This package owns no durable session-event shapes
 * (run_python only executes a subprocess and returns an ephemeral value), so no
 * validators install — the registration still reserves the package name so a
 * later durable event added here cannot silently collide.
 * @module @deepseek-ai/dsh-aimo-python/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-aimo-python'

/** Cordis companion plugin name. */
export const name = 'aimo-python-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No package-owned durable events to validate. */
const install: InvariantInstaller = Object.assign((_ctx: Context): void => {}, { inject: [] })

/** Register the no-op invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
