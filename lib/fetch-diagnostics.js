/**
 * Fetch-boundary diagnostics for `dsh-better-tips`.
 *
 * pi-ai flattens every transport failure to `error.message` before the Harness
 * sees it, so the actionable part — the `cause` chain (`ECONNRESET`,
 * `other side closed`, TLS/DNS failures) and the provider's non-2xx response
 * headers/body — is discarded upstream. This module wraps `globalThis.fetch`
 * and keeps a small ring of failure records so the failed model request can be
 * paired with what actually came back.
 *
 * What it records, and what it deliberately does not:
 *
 * - Only failed requests: a thrown fetch error or a non-2xx response.
 * - For a response: status, status text, an allowlisted set of diagnostic
 *   headers, and at most `maxBodyChars` of the body (never an SSE body).
 * - For a thrown error: the error's name/message and its `cause` chain.
 * - Never: request bodies, request headers, `Authorization`, query strings,
 *   cookies, or successful response bodies.
 *
 * Every captured string is redacted for common credential shapes before it is
 * stored or returned to the browser.
 * @module dsh-better-tips/fetch-diagnostics
 */

import { subscribe as subscribeChannel, unsubscribe as unsubscribeChannel } from 'node:diagnostics_channel'
import { AsyncLocalStorage } from 'node:async_hooks'

/** Headers that can identify the edge/gateway that answered. */
const HEADER_ALLOWLIST = Object.freeze([
  'server',
  'via',
  'cf-ray',
  'cf-cache-status',
  'x-request-id',
  'request-id',
  'x-served-by',
  'x-cache',
  'retry-after',
  'content-type',
  'x-ratelimit-limit-requests',
  'x-ratelimit-remaining-requests',
  'x-ratelimit-reset-requests',
])

const DEFAULT_OPTIONS = Object.freeze({
  maxRecords: 100,
  maxBodyChars: 4096,
  /** Deep enough to reach undici's socket/`ECONNRESET` node under `fetch failed`. */
  maxErrorDepth: 6,
  /** Empty means every host is inspected. */
  hosts: [],
})

/** Remove the credential shapes a provider error body may echo. */
export function redactSecrets (text) {
  return String(text)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9._-]{8,}/g, 'sk-[redacted]')
    .replace(/\b(?:api[_-]?key|token|secret)["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/gi, (match) => {
      const separator = match.includes('=') ? '=' : ':'
      const label = match.slice(0, match.indexOf(separator)).trim()
      return `${label}${separator}[redacted]`
    })
}

/**
 * Host + path of a request. The query string is dropped on purpose: some
 * gateways put credentials there.
 * @param {unknown} input
 * @returns {{ host: string, path: string } | undefined}
 */
export function requestAddress (input) {
  const raw = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : typeof input?.url === 'string'
        ? input.url
        : undefined
  if (raw === undefined) return undefined
  try {
    const url = new URL(raw)
    return { host: url.host.toLowerCase(), path: url.pathname }
  } catch {
    return undefined
  }
}

/**
 * JSON-safe description of a thrown value and its `cause` chain.
 * @param {unknown} error
 * @param {number} depth
 * @param {number} maximum
 */
export function describeError (error, depth = 0, maximum = DEFAULT_OPTIONS.maxErrorDepth) {
  if (error === undefined || error === null || depth > maximum) return undefined
  const source = typeof error === 'object' ? error : {}
  const description = {
    name: typeof source.name === 'string' ? redactSecrets(source.name) : undefined,
    message: typeof source.message === 'string'
      ? redactSecrets(source.message)
      : redactSecrets(String(error)),
    code: typeof source.code === 'string' ? redactSecrets(source.code) : undefined,
    errno: typeof source.errno === 'string' || typeof source.errno === 'number' ? source.errno : undefined,
    syscall: typeof source.syscall === 'string' ? source.syscall : undefined,
    address: typeof source.address === 'string' ? source.address : undefined,
    port: typeof source.port === 'number' ? source.port : undefined,
  }
  const cause = describeError(source.cause, depth + 1, maximum)
  if (cause !== undefined) description.cause = cause
  for (const key of Object.keys(description)) {
    if (description[key] === undefined) delete description[key]
  }
  return description
}

/** Copy the allowlisted diagnostic headers, redacted and capped. */
function diagnosticHeaders (headers) {
  const subset = {}
  for (const name of HEADER_ALLOWLIST) {
    const value = headers.get(name)
    if (value === null) continue
    subset[name] = redactSecrets(value).slice(0, 200)
  }
  return subset
}

/**
 * Pass-through wrapper for an SSE body. A model stream that breaks *after* the
 * 200 response has no HTTP error at all: the failure only exists as a rejected
 * read on the body stream, so the fetch call already returned successfully.
 * This wrapper forwards every chunk untouched and reports the read error (and
 * how much had arrived) exactly once.
 * @param {Response} response
 * @param {(failure: { bytes: number, error: unknown }) => void} report
 * @returns {Response}
 */
function withStreamWatch (response, report) {
  const original = response.body
  if (original === null || typeof original.getReader !== 'function') return response
  const reader = original.getReader()
  let bytes = 0
  let reported = false
  let ended = false
  const reportOnce = (error) => {
    if (reported) return
    reported = true
    try {
      report({ bytes, error })
    } catch {
      // Never let diagnostics break the stream.
    }
  }
  const body = new ReadableStream({
    async pull (controller) {
      if (ended) return
      let result
      try {
        // Only this operation can supply upstream read evidence. Controller
        // close/enqueue failures are local wrapper faults, never network errors.
        result = await reader.read()
      } catch (error) {
        reportOnce(error)
        if (ended) return // Cancellation already settled the downstream reads.
        ended = true
        controller.error(error)
        return
      }
      // cancel() closes the downstream controller synchronously, while the
      // upstream read may still resolve later (with either done or a chunk).
      if (ended) return
      if (result.done === true) {
        ended = true
        controller.close()
        return
      }
      bytes += result.value?.byteLength ?? 0
      controller.enqueue(result.value)
    },
    cancel (reason) {
      ended = true
      return reader.cancel(reason)
    },
  })
  const watched = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
  // The public constructor cannot accept these fetch-owned metadata fields.
  // Keep the original values without proxying native Response methods.
  for (const key of ['url', 'type', 'redirected']) {
    Object.defineProperty(watched, key, { value: response[key], enumerable: true, configurable: true })
  }
  return watched
}

function diagnosticContext (value) {
  if (!value || typeof value !== 'object') return undefined
  const context = {}
  for (const key of ['attemptId', 'sessionId', 'provider', 'purpose']) {
    if (Object.hasOwn(value, key) && typeof value[key] === 'string') context[key] = value[key]
  }
  if (Object.hasOwn(value, 'startedAt') && Number.isFinite(value.startedAt)) context.startedAt = value.startedAt
  return Object.keys(context).length ? Object.freeze(context) : undefined
}

/** Redact before the display cap, including credentials split at the byte boundary. */
function redactBody (text, truncated, maxChars) {
  let safe = String(text)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9._-]+/g, 'sk-[redacted]')
    .replace(/\b(?:api[_-]?key|token|secret)["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]+/gi, (match) => `${match.slice(0, match.search(/[:=]/) + 1)}[redacted]`)
  if (truncated) safe = safe.replace(/\b(?:B(?:e(?:a(?:r(?:e(?:r)?)?)?)?)?|sk-?|api(?:[_-]?key)?|token|secret)["']?\s*[:=]?\s*["']?$/gi, '[redacted]')
  return safe.slice(0, maxChars)
}

/** Read only a bounded clone prefix; cancelling a tee branch must never await its peer. */
function captureResponseBody (response, record, { maxBodyBytes, maxBodyChars, timeoutMs, active }) {
  record.bodyLimit = maxBodyBytes
  record.bodyBytes = 0
  if ((response.headers.get('content-type') ?? '').toLowerCase().includes('text/event-stream')) {
    record.bodyState = 'skipped'
    record.bodyReason = 'event-stream'
    return
  }
  record.bodyState = 'pending'
  let reader
  let timer
  let stopped = false
  let used = 0
  const buffer = new Uint8Array(maxBodyBytes)
  let stopRead
  const stopping = new Promise((resolve) => { stopRead = resolve })
  const cancelReader = () => {
    try { Promise.resolve(reader?.cancel()).catch(() => {}) } catch {}
  }
  const finish = (state, reason) => {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    active.delete(record)
    record.bodyBytes = used
    const decoded = new TextDecoder().decode(buffer.subarray(0, used))
    const text = redactBody(decoded, state !== 'complete', maxBodyChars)
    record.body = text
    record.bodyState = state === 'complete' && decoded.length > maxBodyChars ? 'truncated' : state
    if (reason) record.bodyReason = reason
    stopRead({ stopped: true })
    if (state !== 'complete') cancelReader()
  }
  active.set(record, (reason = 'uninstalled') => finish('unreadable', reason))
  while (active.size > 8) active.values().next().value('capacity')
  timer = setTimeout(() => finish('unreadable', 'deadline'), timeoutMs)
  ;(async () => {
    try {
      const clone = response.clone()
      if (!clone.body) { finish('complete'); return }
      reader = clone.body.getReader()
      while (!stopped) {
        const result = await Promise.race([reader.read(), stopping])
        if (result.stopped || stopped) return
        if (result.done) { finish('complete'); return }
        const chunk = result.value
        const remaining = maxBodyBytes - used
        const length = Math.min(chunk.byteLength, remaining)
        buffer.set(chunk.subarray(0, length), used)
        used += length
        if (used === maxBodyBytes) { finish('truncated', 'byte-limit'); return }
      }
    } catch {
      finish('unreadable', 'read-error')
    } finally {
      try { reader?.releaseLock() } catch {}
    }
  })()
}

/**
 * Install the recorder over the process-wide fetch.
 *
 * The wrapper never changes a response, never swallows an error, and any
 * failure inside the recorder itself falls back to the untouched result.
 * @param {{ maxRecords?: number, maxBodyChars?: number, maxBodyBytes?: number, bodyReadTimeoutMs?: number, hosts?: readonly string[] }} [options]
 */
export function installFetchDiagnostics (options = {}) {
  const scope = globalThis
  const original = scope.fetch
  if (typeof original !== 'function') {
    throw new TypeError('dsh-better-tips: global fetch is unavailable; diagnostics cannot be installed')
  }
  const maxRecords = Number.isSafeInteger(options.maxRecords) && options.maxRecords > 0
    ? options.maxRecords
    : DEFAULT_OPTIONS.maxRecords
  const maxBodyChars = Number.isSafeInteger(options.maxBodyChars) && options.maxBodyChars > 0
    ? options.maxBodyChars
    : DEFAULT_OPTIONS.maxBodyChars
  const hosts = (options.hosts ?? DEFAULT_OPTIONS.hosts)
    .map((host) => String(host).toLowerCase())
    .filter((host) => host.length > 0)
  const maxBodyBytes = Number.isSafeInteger(options.maxBodyBytes) && options.maxBodyBytes > 0
    ? Math.min(options.maxBodyBytes, 1048576) : Math.min(maxBodyChars * 4, 65536)
  const bodyReadTimeoutMs = Number.isFinite(options.bodyReadTimeoutMs) && options.bodyReadTimeoutMs > 0
    ? Math.min(options.bodyReadTimeoutMs, 60000) : 2000
  const contexts = new AsyncLocalStorage()
  const requestContexts = new WeakMap()
  const errorRecords = new WeakMap()
  const requestRecords = new WeakMap()
  const bodyReads = new Map()
  let installed = true
  const records = []
  let nextId = 1
  const object = (value) => value !== null && (typeof value === 'object' || typeof value === 'function')
  const errorNodes = (error) => {
    const nodes = []
    for (let depth = 0; object(error) && depth < 16 && !nodes.includes(error); depth++, error = error.cause) nodes.push(error)
    return nodes
  }
  const networkRecord = (record, error, request) => {
    const nodes = errorNodes(error)
    const candidate = (object(request) ? requestRecords.get(request) : undefined) ?? nodes.map((node) => errorRecords.get(node)).find(Boolean)
    const existing = candidate && candidate.context?.attemptId === record.context?.attemptId ? candidate : undefined
    if (existing) {
      if (record.kind === 'network') Object.assign(existing, record, { id: existing.id, context: record.context ?? existing.context })
      if (record.context && !existing.context) existing.context = record.context
      for (const node of nodes) errorRecords.set(node, existing)
      if (object(request)) requestRecords.set(request, existing)
      return
    }
    push(record)
    for (const node of nodes) errorRecords.set(node, record)
    if (object(request)) requestRecords.set(request, record)
  }

  const inspected = (address) => address !== undefined && (hosts.length === 0 || hosts.includes(address.host))
  const push = (record) => {
    if (!installed) return
    records.push(record)
    while (records.length > maxRecords) {
      const evicted = records.shift()
      bodyReads.get(evicted)?.('evicted')
    }
  }

  const guarded = async function guardedFetch (input, init) {
    const address = inspected(requestAddress(input)) ? requestAddress(input) : undefined
    const startedAt = Date.now()
    const context = contexts.getStore()
    let response
    try {
      response = await original.call(this, input, init)
    } catch (error) {
      try {
        if (address !== undefined) {
          const at = Date.now()
          networkRecord({
            id: nextId++,
            at,
            startedAt,
            elapsedMs: at - startedAt,
            kind: 'network',
            host: address.host,
            path: address.path,
            context,
            error: describeError(error),
          }, error)
        }
      } catch {
        // Diagnostics must never mask the original network error.
      }
      throw error
    }

    try {
      if (address !== undefined && response.ok === false) {
        const at = Date.now()
        const record = {
          id: nextId++,
          at,
          startedAt,
          elapsedMs: at - startedAt,
          kind: 'response',
          host: address.host,
          path: address.path,
          context,
          status: response.status,
          statusText: redactSecrets(response.statusText ?? ''),
          headers: diagnosticHeaders(response.headers),
          body: '',
        }
        push(record)
        if (installed) captureResponseBody(response, record, { maxBodyBytes, maxBodyChars, timeoutMs: bodyReadTimeoutMs, active: bodyReads })
      }
    } catch {
      // A diagnostic failure must not change what the caller receives.
    }
    try {
      if (address !== undefined && response.body !== null) {
        const streamedStatus = response.status
        const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
        if (contentType.includes('text/event-stream')) {
          response = withStreamWatch(response, ({ bytes, error }) => {
            const at = Date.now()
            push({
              id: nextId++,
              at,
              startedAt,
              elapsedMs: at - startedAt,
              kind: 'stream',
              host: address.host,
              path: address.path,
              status: streamedStatus,
              bytes,
              context,
              error: describeError(error),
            })
          })
        }
      }
    } catch {
      // A diagnostic failure must not change what the caller receives.
    }
    return response
  }

  scope.fetch = guarded

  // Second, independent seam. undici publishes the raw dispatcher error for
  // every request through diagnostics_channel, even when a caller reached it
  // through a `fetch` reference created before this wrapper was installed.
  // That makes the recorder work when the global wrapper is bypassed.
  let channelWatching = false
  let stopChannel = () => {}
  try {
    const onRequestCreate = (message) => {
      if (object(message?.request)) requestContexts.set(message.request, contexts.getStore())
    }
    const onRequestError = (message) => {
      try {
        const error = message?.error
        if (error === undefined || error === null) return
        const request = message?.request
        const origin = typeof request?.origin === 'string' ? request.origin : ''
        const path = typeof request?.path === 'string' ? request.path.split('?')[0] : ''
        let host
        try {
          host = new URL(origin).host.toLowerCase()
        } catch {
          host = undefined
        }
        if (host !== undefined && hosts.length > 0 && !hosts.includes(host)) return
        const context = object(request) && requestContexts.has(request) ? requestContexts.get(request) : contexts.getStore()
        networkRecord({ id: nextId++, at: Date.now(), kind: 'undici', host, path, context, error: describeError(error) }, error, request)
      } catch {
        // Never let a channel listener throw into undici.
      }
    }
    subscribeChannel('undici:request:create', onRequestCreate)
    subscribeChannel('undici:request:error', onRequestError)
    channelWatching = true
    stopChannel = () => {
      try {
        unsubscribeChannel('undici:request:create', onRequestCreate)
        unsubscribeChannel('undici:request:error', onRequestError)
      } catch {
        // Already gone.
      }
    }
  } catch {
    // diagnostics_channel is unavailable; the fetch wrapper stays the only seam.
  }

  return {
    run (context, fn) {
      return contexts.run(diagnosticContext(context), fn)
    },
    /** New array, live records: body completion stays observable, consume never hides an attempt. */
    recordsFor (attemptId) {
      if (typeof attemptId !== 'string' || !attemptId) return []
      return records.filter((record) => record.context?.attemptId === attemptId)
    },
    /** Restore only if nothing else replaced the global since installation. */
    uninstall () {
      installed = false
      stopChannel()
      for (const cancel of [...bodyReads.values()]) cancel('uninstalled')
      if (scope.fetch === guarded) scope.fetch = original
    },
    /**
     * Most recent unconsumed record within the window, or undefined. Returns
     * the live record: a response body may still be filling in asynchronously.
     * @param {number} withinMs
     * @param {number} [now]
     */
    latest (withinMs = 10000, now = Date.now()) {
      for (let index = records.length - 1; index >= 0; index -= 1) {
        const record = records[index]
        if (record.consumedAt !== undefined) continue
        if (now - record.at > withinMs) return undefined
        return record
      }
      return undefined
    },
    /** Mark one record as paired with a failure so it is not reused. */
    consume (id) {
      const record = records.find((candidate) => candidate.id === id)
      if (record !== undefined) record.consumedAt = Date.now()
    },
    /**
     * The record closest to one instant, without consuming it. Compaction
     * summarization is not an agent request, so it has no step to pair with and
     * no other reader to race; its evidence is found by the time the attempt
     * itself ended. `latest()` cannot do this: it is newest-first and stops at
     * the first consumed record.
     * @param {number} at
     * @param {number} [toleranceMs]
     * @param {(record: object) => boolean} [accept]
     */
    near (at, toleranceMs = 60000, accept = undefined) {
      if (!Number.isFinite(at)) return undefined
      let best
      let bestDistance = Number.POSITIVE_INFINITY
      for (const record of records) {
        if (typeof accept === 'function' && !accept(record)) continue
        const distance = Math.abs(record.at - at)
        if (distance > toleranceMs || distance >= bestDistance) continue
        best = record
        bestDistance = distance
      }
      return best
    },
    /** Detached copy for logs and tests. */
    snapshot () {
      return records.map((record) => ({ ...record, headers: { ...record.headers } }))
    },
    /**
     * Newest-first detached copies, for the panel's "captured, but could not
     * pair this turn" case: seeing the address and time of the last failed
     * request is still evidence the reader can reason about.
     * @param {number} [limit]
     */
    recent (limit = 3) {
      return records.slice(-Math.max(1, limit)).reverse().map((record) => ({ ...record, headers: { ...record.headers } }))
    },
    stats () {
      return { records: records.length, hostFilter: hosts.slice(), channel: channelWatching }
    },
  }
}
