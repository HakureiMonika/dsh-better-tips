/**
 * Host half of `dsh-better-tips`.
 *
 * Three jobs:
 *
 * 1. Take over failures the shipped `dsh-llm-retry` executor declined, with a
 *    small extra budget per step. Each attempt is persisted as the shipped
 *    `llm/retry` / `llm/retry-started` pair, so the browser half (and any other
 *    reader of the session log) sees the whole chain with its original text.
 * 2. Capture what the fetch boundary saw for a failed request —the network
 *    error's `cause` chain, or a non-2xx response's status and diagnostic
 *    headers/body —and expose it to the browser half. This is the only place
 *    where that evidence still exists: pi-ai flattens it into `error.message`
 *    before the Harness sees the failure.
 * 3. Do the same for context compaction. A compaction summary is one auxiliary
 *    `llm/stream` call with `purpose: 'compaction'`; when it fails, the shipped
 *    UI shows either one generic sentence (`/compact`) or nothing at all (the
 *    automatic triggers only write a log line). This half retries that one call
 *    on the same policy and keeps its provider/model/timing/attempt evidence, so
 *    the browser half can render the failed compression inline.
 *
 * Nothing here rewrites a failure. The browser half reads the durable
 * `llm/retry` and `turn/end` events verbatim; the captured detail is an
 * optional second layer bound to one process-local request context.
 * @module dsh-better-tips
 */

import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, resolve, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { readLogMetadata } from './lib/log-metadata.js'
import { describeError, installFetchDiagnostics, redactSecrets } from './lib/fetch-diagnostics.js'
import {
  officialPolicyKey,
  ourPolicyKey,
  pruneChains,
  resolveSettings,
  retryDelay,
  shouldRetry,
} from './lib/policy.js'

export const name = 'dsh-better-tips'

/** Session ids are branded UUID-ish strings; keep the route's input boring. */
const SESSION_KEY = /^[A-Za-z0-9_.:-]{1,160}$/

/**
 * One step can fail several times — the shipped executor and this plugin each
 * retry the SAME step — and the provider may answer differently every attempt
 * (499 then 431, 504 then 431). Keep a short per-step history so a row can be
 * matched to its own attempt instead of inheriting the next one's evidence.
 */
const MAX_ATTEMPTS_PER_STEP = 8

/**
 * Wait for `delayMs`, resolving `true` when the wait completed and `false`
 * when the signal aborted first. Mirrors the shipped executor: a cancelled
 * turn must not leave a pending retry behind.
 * @param {number} delayMs
 * @param {AbortSignal} signal
 * @returns {Promise<boolean>}
 */
function cancellableDelay (delayMs, signal) {
  if (signal.aborted) return Promise.resolve(false)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve(true)
    }, delayMs)
    function onAbort () {
      clearTimeout(timer)
      resolve(false)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** Explicit provider HTTP formats only; a prose-leading three-digit number is not a status. */
function statusFromMessage (message) {
  const match = /^\s*(?:HTTP\s+)?([45]\d{2})(?::(?:\s|$)|\s+status code\b)/i.exec(String(message ?? ''))
  return match === null ? undefined : Number(match[1])
}

function validSessionKey (value) {
  return typeof value === 'string' && value.length > 0 && SESSION_KEY.test(value)
}

/**
 * Every diagnostic JSON route shares this final privacy boundary, including
 * metadata failures and recorder/context fields not produced by describeError.
 * These are common credential-shape filters, not a complete secret detector.
 * Never rewrite an identity into a different usable identity: omit a suspect
 * identity instead, so strict Client association fails closed.
 */
const DIAGNOSTIC_IDENTITY_FIELDS = new Set(['id', 'attemptId', 'sessionId', 'provider', 'model', 'purpose'])
function redactDiagnosticString (value) {
  // Provider codes may prefix an echoed credential with `_`, which is a word
  // character and defeats the shared helper's leading word boundary.
  return redactSecrets(value).replace(/(?:sk-[A-Za-z0-9._-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,})/gi,
    (match) => /^sk-/i.test(match) ? 'sk-[redacted]' : 'Bearer [redacted]')
}
function diagnosticOutput (value, key = '') {
  if (typeof value === 'string') {
    const safe = redactDiagnosticString(value)
    return DIAGNOSTIC_IDENTITY_FIELDS.has(key) && safe !== value ? undefined : safe
  }
  if (Array.isArray(value)) return value.map((item) => diagnosticOutput(item))
  if (value === null || typeof value !== 'object') return value
  const auth = value.code === 'AUTH'
  return Object.fromEntries(Object.entries(value).map(([field, item]) => [redactDiagnosticString(field),
    auth && field === 'message' ? '' : diagnosticOutput(item, field)]).concat(auth ? [['protected', true]] : []))
}

function jsonResponse (body, status = 200) {
  return new Response(JSON.stringify(diagnosticOutput(body)), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

/** Keep the per-process detail map bounded. */
function pruneDetails (details, maximum = 200) {
  while (details.size > maximum) {
    const oldest = details.keys().next()
    if (oldest.done === true) break
    details.delete(oldest.value)
  }
}

/** Strip the recorder's bookkeeping fields before sending to the browser. */
function shapeDetail (record, protectCredentials = false) {
  return {
    id: record.id,
    kind: record.kind,
    at: record.at,
    startedAt: record.startedAt,
    elapsedMs: record.elapsedMs,
    host: record.host,
    path: record.path,
    status: record.status,
    statusText: protectCredentials ? undefined : record.statusText,
    headers: record.headers,
    body: protectCredentials ? undefined : record.body,
    bodyState: protectCredentials ? 'skipped' : record.bodyState,
    bodyReason: protectCredentials ? 'credential-protection' : record.bodyReason,
    bodyBytes: record.bodyBytes,
    bodyLimit: record.bodyLimit,
    context: record.context,
    bytes: record.bytes,
    error: protectCredentials ? undefined : record.error,
    ...(protectCredentials ? { protected: true } : {}),
  }
}

/** Authentication can be wrapped by an adapter error; withhold the whole diagnostic text. */
function hasAuthCause (value) {
  const seen = new Set()
  const pending = [{ value, depth: 0 }]
  for (let index = 0; index < pending.length && index < 64; index++) {
    const { value, depth } = pending[index]
    if (!value || typeof value !== 'object' || depth > 16 || seen.has(value)) continue
    if (value.code === 'AUTH') return true
    seen.add(value)
    const append = (child) => { if (pending.length < 64) pending.push({ value: child, depth: depth + 1 }) }
    if (value.cause !== undefined) append(value.cause)
    if (Array.isArray(value.errors)) {
      for (let at = 0; at < value.errors.length && pending.length < 64; at++) append(value.errors[at])
    }
  }
  return false
}

/** One "captured but unmatched" request: address, time and the failure shape. */
function shapeRecent (record) {
  return {
    kind: record.kind,
    at: record.at,
    elapsedMs: record.elapsedMs,
    host: record.host,
    path: record.path,
    status: record.status,
    bytes: record.bytes,
    error: record.error === undefined ? undefined : { name: record.error.name, message: record.error.message, code: record.error.code },
  }
}

/** How many finished compaction attempts one session keeps in memory. */
const MAX_COMPACTION_RECORDS = 12

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Record<string, unknown>} [config]
 */
export function apply (ctx, config = {}) {
  const settings = resolveSettings(config)
  if (!settings.enabled) return

  const lifetime = new AbortController()
  /** @type {Set<Promise<unknown>>} */
  const active = new Set()
  /** Per open step: how many extra attempts we already scheduled. */
  /** @type {Map<string, { retry: number, retryId: string }>} */
  const chains = new Map()
  /** Per session/turn/step: the fetch-boundary evidence for that failure. */
  /** @type {Map<string, { step: number, at: number, record: object }>} */
  const details = new Map()
  /** Per session: recent compaction summarization attempts (this process only). */
  /** @type {Map<string, object[]>} */
  const compactions = new Map()

  const track = (operation) => {
    const tracked = operation.finally(() => active.delete(tracked))
    active.add(tracked)
    return tracked
  }

  const projections = () => {
    try {
      return ctx.get('sessionProjections')
    } catch {
      return undefined
    }
  }

  // --- fetch-boundary diagnostics -----------------------------------------
  let diagnostics
  /** Why the recorder is absent, when it is: the panel reports this instead of guessing. */
  let diagnosticsProblem = settings.captureDetails ? '' : 'config-disabled'
  if (settings.captureDetails) {
    try {
      diagnostics = installFetchDiagnostics({ hosts: settings.captureHosts })
      ctx.effect(() => () => diagnostics.uninstall(), 'better-tips: fetch diagnostics')
    } catch (error) {
      diagnosticsProblem = String(error?.message ?? error)
      ctx.logger?.warn?.('better-tips: fetch diagnostics unavailable; the panel will show session-log facts only: %o', error)
      diagnostics = undefined
    }
  }

  const requestFailures = new WeakMap()
  const pendingFailures = new Map()
  const failureKey = (failure) => JSON.stringify([failure?.code, failure?.message, failure?.status, failure?.requestId])
  const scoped = (context, operation) => diagnostics ? diagnostics.run(context, operation) : operation()
  const captureFor = (context) => {
    const records = diagnostics?.recordsFor(context.attemptId) ?? []
    return records.filter((record) => record.context?.sessionId === context.sessionId && record.context?.provider === context.provider).at(-1)
  }
  function scopedStream (options, next, onContext) {
    const context = { attemptId: randomUUID(), sessionId: options.sessionId, provider: options.provider,
      model: typeof options.model === 'string' ? options.model : undefined,
      purpose: options.purpose ?? 'agent', startedAt: Date.now() }
    onContext?.(context)
    return (async function * () {
      const source = await scoped(context, next)
      const iterator = scoped(context, () => source[Symbol.asyncIterator]())
      let done = false
      try {
        while (true) {
          const result = await scoped(context, () => iterator.next())
          if (result.done) { done = true; return }
          const chunk = result.value
          if (chunk?.type === 'finish' && chunk.reason?.kind === 'error') {
            const failure = chunk.reason.failure
            if (failure && typeof failure === 'object') {
              requestFailures.set(failure, context)
              if (context.purpose === 'agent' && context.sessionId) {
                const pending = pendingFailures.get(context.sessionId) ?? []
                pending.push({ context, failureKey: failureKey(failure), failedAt: Date.now() })
                pendingFailures.set(context.sessionId, pending.slice(-12))
                pruneDetails(pendingFailures)
              }
            }
          }
          yield chunk
        }
      } finally {
        if (!done && iterator.return) await scoped(context, () => iterator.return())
      }
    })()
  }

  const rememberDetail = (payload) => {
    const { agent, turn, step, provider, failure } = payload ?? {}
    if (!agent?.id || !Number.isSafeInteger(turn) || !Number.isSafeInteger(step) || failure?.code === 'ABORTED') return
    const pending = (pendingFailures.get(agent.id) ?? []).filter((item) => Date.now() - item.failedAt <= 120000)
    const candidates = pending.filter((item) => item.context.provider === provider && item.failureKey === failureKey(failure))
    const exactContext = failure && typeof failure === 'object' ? requestFailures.get(failure) : undefined
    const context = exactContext ?? (candidates.length === 1 ? candidates[0].context : undefined)
    if (!context || context.sessionId !== agent.id || context.provider !== provider) return
    requestFailures.delete(failure)
    pendingFailures.set(agent.id, pending.filter((item) => item.context.attemptId !== context.attemptId))
    const key = `${agent.id}:${turn}:${step}`
    const history = details.get(key) ?? []
    const now = Date.now()
    const record = captureFor(context)
    const eventFromSeq = Number.isSafeInteger(agent.session?.seq) ? agent.session.seq : undefined
    // Close earlier intervals before publishing the next attempt. Keep this on
    // the record itself so an in-flight API snapshot observes the new boundary.
    if (eventFromSeq !== undefined) for (const [entryKey, entries] of details) {
      if (!entryKey.startsWith(`${agent.id}:`)) continue
      for (const entry of entries) if (entry.eventToSeq === undefined) entry.eventToSeq = eventFromSeq
    }
    history.push({ step, provider, attemptId: context.attemptId,
      // seq is the next append position at this exact request-error boundary.
      // Do not persist or infer it from wall-clock time.
      eventFromSeq,
      failureKey: failureKey(failure),
      failureIndex: (history.at(-1)?.failureIndex ?? 0) + 1, failureTime: now,
      at: record?.at ?? now, lagMs: record ? Math.max(0, now - record.at) : undefined,
      provenance: 'request-context', context, approximate: false,
      failureMessage: String(failure.message ?? ''), failureCode: String(failure.code ?? ''), record })
    details.delete(key)
    details.set(key, history.slice(-MAX_ATTEMPTS_PER_STEP))
    pruneDetails(details)
    return record
  }

  // --- compaction (context compression) -----------------------------------
  /** Keep one finished compaction attempt, bounded per session. */
  const rememberCompaction = (record) => {
    if (!validSessionKey(record.sessionId)) return
    const history = compactions.get(record.sessionId) ?? []
    compactions.delete(record.sessionId)
    compactions.set(record.sessionId, history.concat(record).slice(-MAX_COMPACTION_RECORDS))
    pruneDetails(compactions)
  }

  /**
   * Buffer one compaction stream and retry it on the same policy the model
   * requests use. Compaction is a single auxiliary `llm/stream` call whose
   * chunks are consumed by an assembler and never painted live, so buffering
   * costs nothing and lets a retry start from a clean attempt instead of
   * duplicating partial summary text.
   * @param {object} options GenerateOptions with `purpose === 'compaction'`
   * @param {() => AsyncIterable<object>} next
   */
  const compactionStream = (options, dispatch) => {
    const record = {
      id: randomUUID(), sessionId: typeof options?.sessionId === 'string' ? options.sessionId : '',
      provider: String(options?.provider ?? ''), model: String(options?.model ?? ''), startedAt: Date.now(),
      endedAt: undefined, status: 'running', attempts: [], delays: [], usage: undefined,
    }
    const signal = AbortSignal.any([lifetime.signal, ...(options.signal ? [options.signal] : [])])
    return (async function * runCompactionAttempts () {
      let release
      const drained = new Promise((resolve) => { release = resolve })
      active.add(drained)
      try {
        for (let index = 1; ; index += 1) {
          signal.throwIfAborted()
          const attempt = { index, startedAt: Date.now() }
          const chunks = []
          let finish
          let context
          const attemptOptions = { ...options, signal }
          try {
            const stream = scopedStream(attemptOptions, () => dispatch(attemptOptions), (value) => {
              context = value
              attempt.attemptId = value.attemptId
              attempt.provenance = 'request-context'
            })
            for await (const chunk of stream) {
              signal.throwIfAborted()
              chunks.push(chunk)
              if (chunk?.type === 'finish') { finish = chunk; break }
            }
          } catch (error) {
            attempt.endedAt = Date.now()
            attempt.elapsedMs = attempt.endedAt - attempt.startedAt
            attempt.protectedAuth = hasAuthCause(error)
            attempt.thrown = describeError(error)
            if (context) attempt.detail = captureFor(context)
            record.attempts.push(attempt)
            record.status = signal.aborted ? 'aborted' : 'thrown'
            record.endedAt = attempt.endedAt
            throw error
          }
          attempt.endedAt = Date.now()
          attempt.elapsedMs = attempt.endedAt - attempt.startedAt
          const reason = finish?.reason
          attempt.finishReason = reason?.kind
          if (reason?.kind === 'error') {
            attempt.failure = { message: String(reason.failure?.message ?? ''), code: String(reason.failure?.code ?? ''),
              status: reason.failure?.status ?? statusFromMessage(reason.failure?.message) }
            if (context) attempt.detail = captureFor(context)
            record.attempts.push(attempt)
            if (!shouldRetry({ failure: reason.failure, settings }).retry || index > settings.compactionRetries || signal.aborted) {
              record.status = signal.aborted ? 'aborted' : 'error'
              record.endedAt = attempt.endedAt
              yield * chunks
              return
            }
            const delayMs = retryDelay({ settings, ourRetry: index, failure: reason.failure })
            record.delays.push(delayMs)
            record.status = 'retrying'
            if (!await cancellableDelay(delayMs, signal)) {
              record.status = 'aborted'; record.endedAt = Date.now()
              signal.throwIfAborted()
              return
            }
            continue
          }
          // This is the summary request's terminal state, not proof of compaction commit.
          record.status = reason?.kind === 'stop' || reason?.kind === 'tool-calls' ? 'ok'
            : reason?.kind === 'max-tokens' ? 'max-tokens' : reason?.kind === 'aborted' ? 'aborted' : 'incomplete'
          const usage = chunks.find((chunk) => chunk?.type === 'usage')
          if (usage?.usage !== undefined) record.usage = usage.usage
          record.attempts.push(attempt)
          record.endedAt = attempt.endedAt
          yield * chunks
          return
        }
      } finally {
        if (record.endedAt === undefined) record.endedAt = Date.now()
        rememberCompaction(record)
        active.delete(drained)
        release()
      }
    })()
  }

  // Re-dispatch each compaction attempt through a fresh LLM pipeline. The WeakSet
  // bypasses only our retry owner, not any other middleware in the new dispatch.
  const compactionDispatches = new WeakSet()
  function compactionListener (options, next) {
    if (lifetime.signal.aborted) return next()
    if (compactionDispatches.has(options)) return next()
    if (options?.purpose !== 'compaction') return scopedStream(options, next)
    const runtime = typeof this?.stream === 'function' ? this : ctx.get('llm')
    if (typeof runtime?.stream !== 'function') return scopedStream(options, next)
    return compactionStream(options, (attemptOptions) => {
      compactionDispatches.add(attemptOptions)
      return runtime.stream(attemptOptions)
    })
  }
  ctx.on('llm/stream', compactionListener, { prepend: true })

  // --- network-detail API --------------------------------------------------
  // Connection can appear after this plugin starts. A one-shot ctx.get()
  // silently skipped route registration forever, leaving a healthy recorder
  // behind a permanent HTTP 404. Own registration in its dependency lifetime.
  ctx.inject(['connection'], (scope) => {
    const connection = scope.connection
    const packageDirectory = async (name) => {
      // The launcher knows the active installation. Do not silently substitute
      // a different DSH reachable from the workspace if that manifest is absent.
      if (name === '@deepseek-ai/dsh' && process.env.DSH_INSTALL_DIR) return process.env.DSH_INSTALL_DIR
      const anchors = [
        ...(typeof process.argv[1] === 'string' ? [resolve(process.argv[1])] : []),
        ...(process.env.DSH_INSTALL_DIR ? [join(process.env.DSH_INSTALL_DIR, 'package.json')] : []),
        join(process.resourcesPath ?? join(dirname(process.execPath), 'resources'), 'app.asar', 'dsh', 'package.json'),
        import.meta.url,
        ...(process.env.DSH_PROFILE_DIR ? [join(process.env.DSH_PROFILE_DIR, 'package.json')] : [])]
      for (const anchor of anchors) {
        const require = createRequire(anchor)
        // The CLI package's own manifest can be the current launch anchor even
        // when package.json is not exported through its package-name resolver.
        if (String(anchor).endsWith('package.json')) {
          try {
            const manifest = JSON.parse(await readFile(anchor, 'utf8'))
            if (manifest.name === name) return dirname(anchor)
          } catch {}
        }
        try { return dirname(require.resolve(`${name}/package.json`)) } catch {}
        try {
          const adapter = dirname(require.resolve('@deepseek-ai/dsh-llm-pi-ai/package.json'))
          const candidate = join(dirname(dirname(adapter)), name)
          const manifest = JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8'))
          if (manifest.name === name) return candidate
        } catch {}
      }
      return undefined
    }
    const packageVersion = async (directory, expectedName) => {
      try {
        if (directory === undefined) return null
        const manifest = JSON.parse(await readFile(directory instanceof URL ? new URL('package.json', directory) : join(directory, 'package.json'), 'utf8'))
        return manifest.name === expectedName && typeof manifest.version === 'string' && manifest.version.trim()
          ? manifest.version.trim() : null
      } catch { return null }
    }
    let runtimePromise
    const runtimeInfo = () => runtimePromise ??= Promise.all([
      Promise.resolve().then(() => packageDirectory('@deepseek-ai/dsh')).then((directory) => packageVersion(directory, '@deepseek-ai/dsh')).catch(() => null),
      packageVersion(new URL('.', import.meta.url), name),
    ]).then(([dshVersion, pluginVersion]) => ({ dshVersion, pluginVersion }))
    const enabledPluginInventory = async (signal) => {
      signal.throwIfAborted()
      let partial = false
      let entriesAvailable = false
      let bundlesAvailable = false
      const unique = new Map()
      const manifests = new Map()
      const resolutions = new Map()
      const nativePackages = new Set()
      const get = (key) => { try { return scope.get(key) } catch { partial = true; return undefined } }
      const packages = get('pluginPackages')
      const manager = get('pluginManager')
      const loader = get('loader')
      const hostBase = scope.baseUrl ?? ctx.baseUrl ?? import.meta.url
      const packageName = (value) => {
        if (typeof value !== 'string' || value.startsWith('.') || value.includes(':') || isAbsolute(value)) return undefined
        const parts = value.split('/')
        const name = value.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
        return /^(?:@[A-Za-z0-9._~-]+\/)?[A-Za-z0-9._~-]+$/.test(name) && redactDiagnosticString(name) === name ? name : undefined
      }
      const add = (name, version) => {
        if (nativePackages.has(name)) return
        if (packageName(name) !== name) { partial = true; return }
        const safeVersion = typeof version === 'string' && /^[0-9A-Za-z][0-9A-Za-z.+_-]*$/.test(version) && redactDiagnosticString(version) === version ? version : null
        if (safeVersion === null) partial = true
        unique.set(JSON.stringify([name, safeVersion]), { name, version: safeVersion })
      }
      let bundles = []
      try {
        if (typeof manager?.listBundles === 'function') {
          const listed = await manager.listBundles()
          signal.throwIfAborted()
          if (!Array.isArray(listed)) throw new Error('invalid inventory')
          bundles = listed
          bundlesAvailable = true
          for (const bundle of bundles) if (bundle.official === true || bundle.availability === 'installation') {
            nativePackages.add(bundle.name)
            for (const row of bundle.rows ?? []) { const name = packageName(row.moduleName); if (name) nativePackages.add(name) }
          }
        }
      } catch { signal.throwIfAborted(); partial = true }
      const readManifest = (path) => {
        if (!manifests.has(String(path))) manifests.set(String(path), (async () => {
          signal.throwIfAborted()
          try { const value = JSON.parse(await readFile(path, { encoding: 'utf8', signal })); signal.throwIfAborted(); return value } catch (error) { signal.throwIfAborted(); return undefined }
        })())
        return manifests.get(String(path))
      }
      const resolveEntry = async (moduleName, anchor = hostBase) => {
        signal.throwIfAborted()
        if (typeof moduleName === 'string' && moduleName.startsWith('cordis:')) return
        const key = JSON.stringify([moduleName, anchor])
        if (!resolutions.has(key)) resolutions.set(key, (async () => {
          const name = packageName(moduleName)
          if (nativePackages.has(name)) return
          let manifestPath
          try {
            if (name) {
              if (typeof packages?.packageOf === 'function') manifestPath = packages.packageOf(name, anchor)?.manifestPath
              else {
                for (const root of createRequire(anchor).resolve.paths(name) ?? []) {
                  const path = join(root, name, 'package.json')
                  if (await readManifest(path)) { manifestPath = path; break }
                }
              }
            } else if (typeof moduleName === 'string' && !moduleName.startsWith('cordis:')) {
              const url = isAbsolute(moduleName) ? undefined : new URL(moduleName, anchor)
              let directory = dirname(isAbsolute(moduleName) ? moduleName : url?.protocol === 'file:' ? fileURLToPath(url) : '')
              if (directory !== '.') for (;;) {
                const path = join(directory, 'package.json')
                if (await readManifest(path)) { manifestPath = path; break }
                const parent = dirname(directory)
                if (parent === directory) break
                directory = parent
              }
            }
          } catch { signal.throwIfAborted() }
          const manifest = manifestPath ? await readManifest(manifestPath) : undefined
          if (manifest && (!name || manifest.name === name)) {
            const repository = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url
            const nativeRepository = typeof repository === 'string' && /^(?:git\+)?https:\/\/github\.com\/deepseek-ai\/deepseek-harness(?:\.git)?\/?$/.test(repository)
            if (nativeRepository) {
              nativePackages.add(manifest.name)
              for (const [key, plugin] of unique) if (plugin.name === manifest.name) unique.delete(key)
            } else add(manifest.name, manifest.version)
          }
          else { partial = true; if (name) add(name, null) }
        })())
        await resolutions.get(key)
        signal.throwIfAborted()
      }
      try {
        if (typeof loader?.entries === 'function') {
          const entries = [...loader.entries()]
          entriesAvailable = true
          for (const entry of entries) {
            signal.throwIfAborted()
            if (entry.options?.group || entry.disabled) continue
            await resolveEntry(entry.options?.name, entry.parent?.tree?.ctx?.baseUrl ?? hostBase)
          }
        } else if (typeof manager?.listPlugins === 'function') {
          const entries = await manager.listPlugins()
          signal.throwIfAborted()
          if (!Array.isArray(entries)) throw new Error('invalid inventory')
          entriesAvailable = true
          for (const entry of entries) if (entry.enabled === true) await resolveEntry(entry.moduleName)
        }
      } catch { signal.throwIfAborted(); partial = true }
      for (const bundle of bundles) {
        signal.throwIfAborted()
        if (bundle.enabled === true) add(bundle.name, bundle.version)
      }
      try {
        const presets = get('agentPresets')
        if (presets) {
          const inspected = typeof presets.inspectCompositions === 'function' ? presets.inspectCompositions() : []
          signal.throwIfAborted()
          if (!Array.isArray(inspected)) throw new Error('invalid preset inventory')
          for (const composition of inspected) for (const entry of composition.modules ?? []) {
            await resolveEntry(entry.moduleName, entry.useHostBase ? hostBase : entry.baseUrl ?? hostBase)
          }
          if (typeof presets.compositionInventory !== 'function') partial = true
          else {
            const compositions = await presets.compositionInventory()
            signal.throwIfAborted()
            if (!Array.isArray(compositions)) throw new Error('invalid preset inventory')
            for (const composition of compositions) {
              if (composition.broken) partial = true
              for (const row of composition.rows ?? []) {
                signal.throwIfAborted()
                const name = packageName(row.moduleName)
                if (nativePackages.has(name) || typeof row.moduleName === 'string' && row.moduleName.startsWith('cordis:')) continue
                const exact = inspected.some((item) => item.id === composition.id && item.modules?.some((entry) => entry.moduleName === row.moduleName))
                if (row.enabled === 'conditional') continue
                if (row.enabled !== true) continue
                if (!exact) {
                  partial = true
                  if (name) add(name, null)
                }
              }
            }
          }
        }
      } catch { signal.throwIfAborted(); partial = true }
      signal.throwIfAborted()
      return { enabledPlugins: [...unique.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : (a.version ?? '') < (b.version ?? '') ? -1 : (a.version ?? '') > (b.version ?? '') ? 1 : 0),
        pluginsStatus: !entriesAvailable && !bundlesAvailable ? 'unavailable' : partial || !entriesAvailable || !bundlesAvailable ? 'partial' : 'complete' }
    }
    // Every diagnostic route answers the owning client only. The guard lives in
    // one wrapper so a route registered later cannot quietly skip it.
    const ownerOnly = (handler) => async (request) => {
      const admission = connection.admit(request)
      if (admission.rejection) return jsonResponse({ error: 'unauthorized' }, admission.rejection)
      if (admission.peer?.principal?.kind !== 'owner') return jsonResponse({ error: 'owner required' }, 403)
      return handler(request)
    }
    const environmentHandler = async (request) => {
      try {
        request.signal.throwIfAborted()
        const inventory = await enabledPluginInventory(request.signal)
        const [dshVersion, pluginVersion] = await Promise.all([
          packageDirectory('@deepseek-ai/dsh').then((directory) => packageVersion(directory, '@deepseek-ai/dsh')),
          packageVersion(new URL('.', import.meta.url), name),
        ])
        request.signal.throwIfAborted()
        return jsonResponse({ runtime: { dshVersion, pluginVersion, ...inventory } })
      } catch { return jsonResponse({ error: request.signal.aborted ? 'cancelled' : 'environment unavailable' }, request.signal.aborted ? 499 : 503) }
    }
    scope.effect(() => connection.fetch.register({ path: '/api/better-tips/environment', methods: ['GET'], requestBody: 'buffered', fetch: ownerOnly(environmentHandler) }), 'better-tips: report environment api')
    const metadataHandler = async (request) => {
      const url = new URL(request.url)
      const sessionId = url.searchParams.get('sessionId') ?? ''
      const seqText = url.searchParams.get('seq') ?? ''
      const seq = Number(seqText)
      if (!validSessionKey(sessionId) || !/^\d+$/.test(seqText) || !Number.isSafeInteger(seq)) return jsonResponse({ error: 'invalid sessionId or seq' }, 400)
      let handle
      try {
        const persistence = scope.get('sessionPersistence')
        const query = scope.get('sessionQuery')
        let event
        if (typeof query?.inspectSession === 'function') {
          // The getter must return detached data, never retain the borrowed
          // Session. Exact eventAt also avoids scanning a complete live log.
          event = await query.inspectSession(sessionId, (session) => {
            const found = session.eventAt(seq)
            return found === undefined ? undefined : structuredClone(found)
          }, request.signal)
        } else if (persistence) {
          handle = await persistence.open(sessionId, 'read', { signal: request.signal })
          const read = await handle.read(seq, 1, { signal: request.signal })
          event = read.events.find((entry) => entry.seq === seq)
        } else return jsonResponse({ error: 'session reader unavailable' }, 503)
        if (!event) return jsonResponse({ error: 'exact event not available; retry reading' }, 404)
        // The installed JSONL backend exposes its resolved root as an own field.
        // Other providers may omit it; never substitute DSH_HOME or a guessed directory.
        const root = typeof persistence?.root === 'string' ? persistence.root : undefined
        return jsonResponse(await readLogMetadata({ root, sessionId, event, resolvePackage: packageDirectory, signal: request.signal }))
      } catch (error) {
        return jsonResponse({ error: String(error?.message ?? error) }, 500)
      } finally { try { await handle?.close() } catch (error) { ctx.logger?.warn?.('better-tips: metadata read handle close failed: %o', error) } }
    }
    scope.effect(() => connection.fetch.register({ path: '/api/better-tips/log-metadata', methods: ['GET'], requestBody: 'buffered', fetch: ownerOnly(metadataHandler) }), 'better-tips: log metadata api')
    // Resolve against the real log, including retries owned by other plugins.
    // A failure boundary ends at the next observed failure (never a timestamp).
    const eventCoordinates = async (sessionId, values, signal) => {
      try {
        const query = scope.get('sessionQuery')
        if (typeof query?.inspectSession !== 'function') return new Map()
        return await query.inspectSession(sessionId, (session) => {
          const coordinates = new Map()
          for (const { value, turn } of values) {
            const from = value.eventFromSeq
            if (!Number.isSafeInteger(from) || from < 0 || from > session.seq) continue
            const end = Math.min(session.seq, from + 128, value.eventToSeq ?? Infinity)
            const events = session.snapshotEvents(from, end)
            const matches = []
            for (const event of events) {
              const data = event.data ?? {}
              // A new step/turn invalidates any still-unbound failure.
              if (['turn/start', 'step/start', 'assistant/attempt', 'assistant/message'].includes(event.type)) break
              if (event.type === 'llm/retry' && data.turn === turn && data.step === value.step
                && data.provider === value.provider && failureKey(data.failure) === value.failureKey) matches.push(event)
              if (event.type === 'turn/end') {
                if (data.turn === turn && data.reason?.kind === 'error' && failureKey(data.reason.error) === value.failureKey) matches.push(event)
                break
              }
            }
            if (matches.length === 1) coordinates.set(value.attemptId, { seq: matches[0].seq,
              kind: matches[0].type === 'llm/retry' ? 'retry' : 'terminal', turn, step: value.step })
          }
          return coordinates
        }, signal)
      } catch { return new Map() } // Missing log evidence must remain tentative.
    }
    const handler = async (request) => {
      try {
        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId') ?? ''
        const turn = Number(url.searchParams.get('turn'))
        if (!validSessionKey(sessionId) || !Number.isSafeInteger(turn)) {
          return jsonResponse({ error: 'invalid sessionId or turn' }, 400)
        }
        const prefix = `${sessionId}:${turn}:`
        const values = [...details.entries()].filter(([key]) => key.startsWith(prefix))
          .flatMap(([, history]) => history.map((value) => ({ value, turn })))
        const coordinates = await eventCoordinates(sessionId, values, request.signal)
        const items = []
        for (const { value } of values) {
          items.push({
            step: value.step,
            provider: value.provider,
            at: value.at,
            lagMs: value.lagMs,
            approximate: value.approximate === true,
            provenance: value.provenance,
            context: value.context,
            attemptId: value.attemptId,
            event: coordinates.get(value.attemptId) ?? null,
            failureIndex: value.failureIndex,
            failureTime: value.failureTime,
            failure: { message: value.failureMessage, code: value.failureCode },
            detail: value.record ? shapeDetail(value.record, value.failureCode === 'AUTH') : undefined,
          })
        }
        items.sort((left, right) => left.at - right.at)
        // The panel shows this so an empty answer is never a mystery: either the
        // recorder never saw a failed request, or it did and the pairing failed.
        const capture = diagnostics === undefined
          ? { installed: false, reason: diagnosticsProblem }
          : {
              installed: true,
              records: diagnostics.stats().records,
              recent: [],
            }
        return jsonResponse({ sessionId, turn, items, capture, runtime: await runtimeInfo() })
      } catch (error) {
        ctx.logger?.warn?.('better-tips: detail route failed: %o', error)
        return jsonResponse({ error: 'detail route failed' }, 500)
      }
    }
    scope.effect(
      () => connection.fetch.register({
        path: '/api/better-tips/details',
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: ownerOnly(handler),
      }),
      'better-tips: network detail api',
    )

    /**
     * Compaction evidence for one session: which model summarized, how long it
     * took, how many attempts the plugin needed, and the fetch-boundary record of
     * the attempt that failed. Compaction has no turn/step to key on, so the
     * browser half correlates these by the attempt's own end time.
     */
    const compactionHandler = async (request) => {
      try {
        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId') ?? ''
        if (!validSessionKey(sessionId)) return jsonResponse({ error: 'invalid sessionId' }, 400)
        const history = compactions.get(sessionId) ?? []
        const records = history.map((record) => ({
          id: record.id,
          provider: record.provider,
          model: record.model,
          startedAt: record.startedAt,
          endedAt: record.endedAt,
          durationMs: record.endedAt === undefined ? undefined : Math.max(0, record.endedAt - record.startedAt),
          status: record.status,
          delays: record.delays.slice(),
          usage: record.usage,
          attempts: record.attempts.map((attempt) => {
            const capture = attempt.detail
            const protectedAuth = attempt.failure?.code === 'AUTH' || attempt.protectedAuth || hasAuthCause(attempt.thrown)
            return {
              index: attempt.index,
              attemptId: attempt.attemptId,
              provenance: attempt.provenance,
              at: attempt.startedAt,
              elapsedMs: attempt.elapsedMs,
              finishReason: attempt.finishReason,
              failure: attempt.failure,
              thrown: protectedAuth && attempt.thrown ? { code: 'AUTH', message: '', protected: true } : attempt.thrown,
              lagMs: capture === undefined ? undefined : Math.max(0, (attempt.endedAt ?? record.endedAt) - capture.at),
              detail: capture === undefined ? undefined : shapeDetail(capture, protectedAuth),
            }
          }),
        }))
        const capture = diagnostics === undefined
          ? { installed: false, reason: diagnosticsProblem }
          : { installed: true, records: diagnostics.stats().records }
        return jsonResponse({ sessionId, records, capture, runtime: await runtimeInfo() })
      } catch (error) {
        ctx.logger?.warn?.('better-tips: compaction route failed: %o', error)
        return jsonResponse({ error: 'compaction route failed' }, 500)
      }
    }
    scope.effect(
      () => connection.fetch.register({
        path: '/api/better-tips/compaction',
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: ownerOnly(compactionHandler),
      }),
      'better-tips: compaction evidence api',
    )
  })

  // --- retry takeover ------------------------------------------------------
  /**
   * How far the built-in executor already went on this provider route, read
   * from its own projection under its own policy key.
   * @param {object} session
   * @param {string} provider
   * @param {object | undefined} retryPolicy
   */
  const officialProgress = (session, provider, retryPolicy) => {
    const service = projections()
    if (service === undefined || retryPolicy === undefined) return undefined
    try {
      const key = officialPolicyKey(retryPolicy)
      if (key === undefined) return undefined
      const state = service.stateOf(session, 'llmRetry')
      return state?.[JSON.stringify([provider, key])]
    } catch {
      return undefined
    }
  }

  /**
   * @param {object} payload
   * @param {() => Promise<{ kind: 'retry' } | undefined>} next
   * @returns {Promise<{ kind: 'retry' } | undefined>}
   */
  async function recover (payload, next) {
    const { agent, turn, step, provider, failure, retryPolicy, signal } = payload ?? {}
    const session = agent?.session
    if (session === undefined || typeof session.append !== 'function') return next()
    if (typeof failure?.code !== 'string' || failure.code === '') return next()
    if (!Number.isSafeInteger(turn) || !Number.isSafeInteger(step)) return next()

    if (!shouldRetry({ failure, settings }).retry) return next()

    const key = `${agent.id}:${turn}:${step}`
    const previous = chains.get(key)
    const retry = (previous?.retry ?? 0) + 1
    if (retry > settings.extraRetries) return next()

    const fused = AbortSignal.any([signal, lifetime.signal])
    if (fused.aborted) return next()

    const official = officialProgress(session, provider, retryPolicy)
    const delayMs = retryDelay({
      settings,
      retryPolicy,
      officialRetry: Number.isSafeInteger(official?.retry) ? official.retry : 0,
      ourRetry: retry,
      failure,
    })

    const retryId = previous?.retryId ?? randomUUID()
    const policyKey = ourPolicyKey(settings)

    try {
      session.append('llm/retry', {
        retryId,
        turn,
        step,
        provider,
        mode: 'normal',
        policyKey,
        retry,
        maxRetries: settings.extraRetries,
        delayMs,
        failure,
      })
    } catch (error) {
      ctx.logger?.warn?.(`better-tips: could not persist the retry attempt for ${provider} (${failure.code}); leaving it to the terminal path: %o`, error)
      return next()
    }

    chains.set(key, { retry, retryId })
    pruneChains(chains)

    if (!await cancellableDelay(delayMs, fused)) return undefined

    try {
      session.append('llm/retry-started', { retryId, turn, step, retry })
    } catch (error) {
      ctx.logger?.warn?.('better-tips: could not record the started retry; leaving the step terminal: %o', error)
      return undefined
    }
    return { kind: 'retry' }
  }

  ctx.on('agent/request-error', (payload, next) => {
    if (!lifetime.signal.aborted) rememberDetail(payload)
    return next()
  }, { prepend: true })

  const listener = (payload, next) => {
    if (lifetime.signal.aborted) return next()
    let delegated = false
    const delegate = () => {
      delegated = true
      return next()
    }
    return track(
      recover(payload, delegate).catch((error) => {
        ctx.logger?.warn?.('better-tips: retry decision failed, leaving the failure untouched: %o', error)
        return delegated ? undefined : delegate()
      }),
    )
  }
  ctx.on('agent/request-error', listener)

  ctx.effect(() => async () => {
    lifetime.abort(new Error('dsh-better-tips disposed'))
    await Promise.allSettled([...active])
  }, 'better-tips: abort and drain in-flight retries')
}
