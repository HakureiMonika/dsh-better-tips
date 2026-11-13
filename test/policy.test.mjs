import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NEVER_RETRY_CODES,
  localDelay,
  officialPolicyKey,
  pruneChains,
  resolveSettings,
  retryDelay,
  shouldRetry,
} from '../lib/policy.js'

const settings = resolveSettings(undefined)

test('defaults: two extra retries, bounded delays, the shipped catch-alls', () => {
  assert.equal(settings.enabled, true)
  assert.equal(settings.extraRetries, 2)
  assert.equal(settings.initialDelayMs, 1000)
  assert.equal(settings.maxDelayMs, 20000)
  assert.deepEqual([...settings.retryableCodes], ['PI_AI_ERROR', 'TRANSPORT', 'TIMEOUT', 'SERVER', 'EMPTY_RESPONSE', 'RATE_LIMIT'])
})

test('bad config values fall back to the documented default, never to disabling', () => {
  const resolved = resolveSettings({
    enabled: 'nope',
    extraRetries: -1,
    initialDelayMs: 'soon',
    maxDelayMs: 99_999_999,
    jitterRatio: 7,
    retryableCodes: 'PI_AI_ERROR',
  })
  assert.equal(resolved.enabled, true)
  assert.equal(resolved.extraRetries, 2)
  assert.equal(resolved.initialDelayMs, 1000)
  assert.equal(resolved.maxDelayMs, 20000)
  assert.equal(resolved.jitterRatio, 0.2)
  assert.deepEqual([...resolved.retryableCodes], ['PI_AI_ERROR', 'TRANSPORT', 'TIMEOUT', 'SERVER', 'EMPTY_RESPONSE', 'RATE_LIMIT'])
})

test('explicit zero is preserved: it is the user switching the extra budget off', () => {
  const resolved = resolveSettings({ extraRetries: 0, initialDelayMs: 0 })
  assert.equal(resolved.extraRetries, 0)
  assert.equal(resolved.initialDelayMs, 0)
})

test('hard-deny beats a hand-written allowlist', () => {
  for (const code of NEVER_RETRY_CODES) {
    const custom = resolveSettings({ retryableCodes: [code] })
    assert.equal(shouldRetry({ failure: { code }, settings: custom }).retry, false, code)
    assert.equal(shouldRetry({ failure: { code }, settings: custom }).reason, 'hard-deny', code)
  }
})

test('unlisted codes are left to the terminal path', () => {
  assert.equal(shouldRetry({ failure: { code: 'WHATEVER' }, settings }).retry, false)
  assert.equal(shouldRetry({ failure: { code: 'INVALID_REQUEST' }, settings }).reason, 'not-listed')
  assert.equal(shouldRetry({ failure: { code: 'PI_AI_ERROR' }, settings }).retry, true)
})

test('the official policy key reproduces the shipped executor key', () => {
  const normal = {
    mode: 'normal',
    maxRetries: 5,
    retryableCodes: ['TIMEOUT', 'RATE_LIMIT'],
    initialDelayMs: 500,
    maxDelayMs: 10000,
    jitterRatio: 0.1,
  }
  assert.equal(
    officialPolicyKey(normal),
    JSON.stringify(['normal', 5, ['RATE_LIMIT', 'TIMEOUT'], 500, 10000, 0.1]),
  )
  assert.equal(
    officialPolicyKey({ mode: 'always', initialDelayMs: 500, maxDelayMs: 10000, jitterRatio: 0.1 }),
    JSON.stringify(['always', 500, 10000, 0.1]),
  )
  assert.equal(officialPolicyKey(undefined), undefined)
})

test('the backoff matches the shipped formula and caps at the ceiling', () => {
  const config = { initialDelayMs: 1000, maxDelayMs: 8000, jitterRatio: 0 }
  assert.equal(localDelay(config, 1, () => 0.5), 1000)
  assert.equal(localDelay(config, 2, () => 0.5), 2000)
  assert.equal(localDelay(config, 4, () => 0.5), 8000)
  assert.equal(localDelay(config, 9, () => 0.5), 8000)
  const jittered = localDelay({ initialDelayMs: 1000, maxDelayMs: 8000, jitterRatio: 0.2 }, 1, () => 1)
  assert.ok(Math.abs(jittered - 1200) < 1e-9)
})

test('our delay continues the official curve instead of restarting at one second', () => {
  const policy = {
    mode: 'normal',
    maxRetries: 5,
    retryableCodes: ['RATE_LIMIT'],
    initialDelayMs: 500,
    maxDelayMs: 10000,
    jitterRatio: 0,
  }
  // The harness already reached 500 * 2^4 = 8000; our first extra attempt is
  // the next step on that same curve, capped by the harness maximum.
  assert.equal(
    retryDelay({ settings, retryPolicy: policy, officialRetry: 5, ourRetry: 1, random: () => 0.5 }),
    10000,
  )
  assert.equal(
    retryDelay({ settings, retryPolicy: policy, officialRetry: 1, ourRetry: 1, random: () => 0.5 }),
    1000,
  )
  // Without provider progress, our own curve starts at settings.initialDelayMs.
  assert.equal(
    retryDelay({ settings, retryPolicy: undefined, officialRetry: 0, ourRetry: 1, random: () => 0.5 }),
    1000,
  )
  assert.equal(
    retryDelay({ settings, retryPolicy: undefined, officialRetry: 0, ourRetry: 2, random: () => 0.5 }),
    2000,
  )
})

test('a provider-requested delay wins, clamped to our ceiling', () => {
  assert.equal(
    retryDelay({ settings, ourRetry: 1, failure: { providerRetryAfterMs: 3000 }, random: () => 0.5 }),
    3000,
  )
  assert.equal(
    retryDelay({ settings, ourRetry: 1, failure: { providerRetryAfterMs: 900000 }, random: () => 0.5 }),
    settings.maxDelayMs,
  )
  assert.equal(
    retryDelay({ settings, ourRetry: 1, failure: { providerRetryAfterMs: 0 }, random: () => 0.5 }),
    1000,
  )
})

test('capture settings resolve with safe defaults and a normalized host filter', () => {
  const resolved = resolveSettings({
    captureDetails: false,
    captureWindowMs: 2500,
    captureHosts: ['GW.Example', '', 'gw2.example', 'gw.example'],
  })
  assert.equal(resolved.captureDetails, false)
  assert.equal(resolved.captureWindowMs, 2500)
  assert.deepEqual([...resolved.captureHosts], ['gw.example', 'gw2.example'])

  const fallback = resolveSettings({ captureWindowMs: 1, captureHosts: 'nope' })
  assert.equal(fallback.captureDetails, true)
  assert.equal(fallback.captureWindowMs, 10000)
  assert.deepEqual([...fallback.captureHosts], [])
})

test('the counter map stays bounded', () => {
  const chains = new Map()
  for (let index = 0; index < 10; index++) chains.set(String(index), { retry: 1 })
  pruneChains(chains, 4)
  assert.equal(chains.size, 4)
  assert.deepEqual([...chains.keys()], ['6', '7', '8', '9'])
})

test('compaction retries have their own budget and degrade safely', () => {
  const resolved = resolveSettings({ compactionRetries: 3 })
  assert.equal(resolved.compactionRetries, 3)
  // A typo must never silently disable the compaction retries.
  assert.equal(resolveSettings({ compactionRetries: 'many' }).compactionRetries, 2)
  assert.equal(resolveSettings({ compactionRetries: -1 }).compactionRetries, 2)
  // An explicit zero is the user switching this budget off.
  assert.equal(resolveSettings({ compactionRetries: 0 }).compactionRetries, 0)
})
