/**
 * Retry policy for `dsh-better-tips` — pure functions, no Cordis, no Harness
 * imports. The Host half owns the side effects; every decision that can be
 * wrong lives here so it can be tested without booting a Harness.
 * @module dsh-better-tips/policy
 */

/** @typedef {{ message: string; code: string; status?: number; providerRetryAfterMs?: number }} LlmFailureLike */

/**
 * Codes a bounded retry can never help. `AUTH` / `MISSING_CREDENTIAL` /
 * `INVALID_CREDENTIAL` need a human or a credential refresh, `QUOTA` needs a
 * different account, `CONTEXT_WINDOW_EXCEEDED` needs compaction, and
 * `ABORTED` is the user's own decision. Retrying any of them burns quota for
 * nothing.
 */
export const NEVER_RETRY_CODES = Object.freeze([
  'AUTH',
  'MISSING_CREDENTIAL',
  'INVALID_CREDENTIAL',
  'QUOTA',
  'ACCOUNT_QUOTA',
  'CONTEXT_WINDOW_EXCEEDED',
  'IMAGE_OFFLOAD_REQUIRED',
  'INVALID_MODEL',
  'INVALID_CONFIG',
  'NO_ADAPTER',
  'ABORTED',
])

/** The shipped default: codes the built-in executor may have declined. */
export const DEFAULT_RETRYABLE_CODES = Object.freeze([
  'PI_AI_ERROR',
  'TRANSPORT',
  'TIMEOUT',
  'SERVER',
  'EMPTY_RESPONSE',
  'RATE_LIMIT',
])

/** @type {Required<import('node:module').ResolvedConfig>} */
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  extraRetries: 2,
  /**
   * Extra attempts for one context-compaction summarization request. It is a
   * separate budget from the per-step model-request budget: a compaction is one
   * long auxiliary call, and its retry never competes with a turn's own retries.
   */
  compactionRetries: 2,
  retryableCodes: DEFAULT_RETRYABLE_CODES,
  initialDelayMs: 1000,
  maxDelayMs: 20000,
  jitterRatio: 0.2,
  captureDetails: true,
  captureWindowMs: 10000,
  captureHosts: [],
})

/**
 * Clamp one numeric setting. A nonsense value falls back to the default
 * instead of becoming 0: `0` is a meaningful "switch off", and a typo must
 * never gain that power.
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @param {(value: number) => boolean} accept
 */
function numberSetting (value, fallback, min, max, accept) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  if (value < min || value > max || !accept(value)) return fallback
  return value
}

/**
 * Resolve the row config into the settings the policy consumes.
 *
 * Every field is type-checked because a `cordis.patch.yml` edit is untrusted
 * input: a string `"3"`, a negative count, or a missing list must degrade to
 * the documented default rather than to an accidental disable.
 * @param {Record<string, unknown> | undefined} config
 */
export function resolveSettings (config) {
  const source = config ?? {}
  const codes = Array.isArray(source.retryableCodes)
    ? source.retryableCodes
        .filter((code) => typeof code === 'string' && code.trim() !== '')
        .map((code) => code.trim())
    : null
  return {
    enabled: source.enabled !== false,
    extraRetries: numberSetting(source.extraRetries, DEFAULT_SETTINGS.extraRetries, 0, 20, Number.isInteger),
    compactionRetries: numberSetting(source.compactionRetries, DEFAULT_SETTINGS.compactionRetries, 0, 10, Number.isInteger),
    retryableCodes: codes !== null && codes.length > 0 ? Object.freeze([...new Set(codes)]) : DEFAULT_RETRYABLE_CODES,
    initialDelayMs: numberSetting(source.initialDelayMs, DEFAULT_SETTINGS.initialDelayMs, 0, 600000, () => true),
    maxDelayMs: numberSetting(source.maxDelayMs, DEFAULT_SETTINGS.maxDelayMs, 0, 600000, () => true),
    jitterRatio: numberSetting(source.jitterRatio, DEFAULT_SETTINGS.jitterRatio, 0, 1, () => true),
    captureDetails: source.captureDetails !== false,
    captureWindowMs: numberSetting(source.captureWindowMs, DEFAULT_SETTINGS.captureWindowMs, 100, 60000, Number.isInteger),
    captureHosts: Array.isArray(source.captureHosts)
      ? Object.freeze([...new Set(source.captureHosts
          .filter((host) => typeof host === 'string' && host.trim() !== '')
          .map((host) => host.trim().toLowerCase()))])
      : DEFAULT_SETTINGS.captureHosts,
  }
}

/**
 * Whether this failure is worth one more bounded attempt.
 * @param {{ failure: LlmFailureLike | undefined, settings: ReturnType<typeof resolveSettings> }} input
 * @returns {{ retry: boolean, reason: string }}
 */
export function shouldRetry ({ failure, settings }) {
  const code = typeof failure?.code === 'string' ? failure.code : ''
  if (code === '') return { retry: false, reason: 'no-code' }
  if (NEVER_RETRY_CODES.includes(code)) return { retry: false, reason: 'hard-deny' }
  if (!settings.retryableCodes.includes(code)) return { retry: false, reason: 'not-listed' }
  return { retry: true, reason: 'listed' }
}

/**
 * The built-in executor's policy key, byte-for-byte: its projection stores
 * progress under `JSON.stringify([provider, policyKey])`, so reproducing the
 * key is how we read how far its own backoff curve already went.
 * @param {{ mode: 'normal' | 'always', maxRetries?: number, retryableCodes?: readonly string[], initialDelayMs: number, maxDelayMs: number, jitterRatio: number } | undefined} policy
 * @returns {string | undefined}
 */
export function officialPolicyKey (policy) {
  if (policy === undefined || policy === null) return undefined
  if (policy.mode === 'always') {
    return JSON.stringify([policy.mode, policy.initialDelayMs, policy.maxDelayMs, policy.jitterRatio])
  }
  return JSON.stringify([
    policy.mode,
    policy.maxRetries,
    [...(policy.retryableCodes ?? [])].sort(),
    policy.initialDelayMs,
    policy.maxDelayMs,
    policy.jitterRatio,
  ])
}

/**
 * The namespace that separates our attempts from the harness's inside the one
 * shared `llm/retry` event stream. The shipped executor never starts a key
 * with `["better-tips"`, so the origin is readable without another event type.
 * @param {ReturnType<typeof resolveSettings>} settings
 */
export function ourPolicyKey (settings) {
  return JSON.stringify([
    'better-tips',
    settings.extraRetries,
    [...settings.retryableCodes].sort(),
    settings.initialDelayMs,
    settings.maxDelayMs,
    settings.jitterRatio,
  ])
}

/**
 * The shipped exponential backoff, verbatim: `initial * 2^(retry-1)`, capped,
 * then symmetric jitter around the result.
 * @param {{ initialDelayMs: number, maxDelayMs: number, jitterRatio: number }} config
 * @param {number} retry
 * @param {() => number} random
 */
export function localDelay (config, retry, random) {
  const exponent = Math.min(Math.max(retry - 1, 0), 1024)
  const exponential = Math.min(config.initialDelayMs * 2 ** exponent, config.maxDelayMs)
  const jitter = 1 - config.jitterRatio + 2 * config.jitterRatio * random()
  return Math.min(exponential * jitter, config.maxDelayMs)
}

/**
 * Delay before our next attempt.
 *
 * When the built-in executor already tried, continue its curve instead of
 * restarting at one second: it had already backed off, and hammering the
 * endpoint that just slowed down is exactly what the curve exists to avoid.
 * A provider-requested delay wins over both, clamped to our ceiling — the
 * shipped executor gives up when that delay exceeds its maximum; one clamped
 * attempt is strictly better than none.
 * @param {{
 *   settings: ReturnType<typeof resolveSettings>,
 *   retryPolicy?: { mode: 'normal' | 'always', maxRetries?: number, retryableCodes?: readonly string[], initialDelayMs: number, maxDelayMs: number, jitterRatio: number },
 *   officialRetry?: number,
 *   ourRetry: number,
 *   failure?: LlmFailureLike,
 *   random?: () => number,
 * }} input
 */
export function retryDelay ({ settings, retryPolicy, officialRetry = 0, ourRetry, failure, random = Math.random }) {
  const providerMs = failure?.providerRetryAfterMs
  if (typeof providerMs === 'number' && Number.isFinite(providerMs) && providerMs > 0) {
    return Math.min(providerMs, settings.maxDelayMs)
  }
  const continuing = officialRetry > 0 && retryPolicy !== undefined
  const base = continuing
    ? {
        initialDelayMs: retryPolicy.initialDelayMs,
        maxDelayMs: Math.min(retryPolicy.maxDelayMs, settings.maxDelayMs),
        jitterRatio: retryPolicy.jitterRatio,
      }
    : {
        initialDelayMs: settings.initialDelayMs,
        maxDelayMs: settings.maxDelayMs,
        jitterRatio: settings.jitterRatio,
      }
  return localDelay(base, officialRetry + ourRetry, random)
}

/**
 * Keep the per-step counter map bounded. A step key is only meaningful while
 * that step is open, so dropping the oldest entries after a long session is
 * safe: the shipped invariant is "budget per step", not "per process".
 * @param {Map<string, unknown>} chains
 * @param {number} maximum
 */
export function pruneChains (chains, maximum = 256) {
  while (chains.size > maximum) {
    const oldest = chains.keys().next()
    if (oldest.done === true) break
    chains.delete(oldest.value)
  }
}
