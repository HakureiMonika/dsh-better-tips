import { test } from 'node:test'
import assert from 'node:assert/strict'
import { channel } from 'node:diagnostics_channel'
const encoder = new TextEncoder()
const tick = () => new Promise((resolve) => setImmediate(resolve))
async function waitBody (record) {
  for (let i = 0; i < 100 && record.bodyState === 'pending'; i++) await tick()
  assert.notEqual(record.bodyState, 'pending', 'diagnostic body must settle')
}
import {
  describeError,
  installFetchDiagnostics,
  redactSecrets,
  requestAddress,
} from '../lib/fetch-diagnostics.js'

const originalFetch = globalThis.fetch

function restore () {
  globalThis.fetch = originalFetch
}

test('a non-2xx response keeps status, diagnostic headers, and a capped body', async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ error: { message: 'bad request for sk-abcdefghijklmnop', type: 'invalid_request_error' } }),
      {
        status: 431,
        statusText: 'Request Header Fields Too Large',
        headers: {
          'content-type': 'application/json',
          server: 'cloudflare',
          'cf-ray': '8f00-SIN',
          'x-request-id': 'req-123',
          'set-cookie': 'must-not-be-captured',
        },
      },
    )
  const diagnostics = installFetchDiagnostics()
  try {
    const response = await globalThis.fetch('https://llm.example/v1/chat/completions?api_key=SECRET')
    assert.equal(response.status, 431)
    await new Promise((resolve) => setTimeout(resolve, 20))

    const record = diagnostics.latest(5000)
    assert.ok(record, 'a failed response must be recorded')
    assert.equal(record.kind, 'response')
    assert.equal(record.status, 431)
    assert.equal(record.statusText, 'Request Header Fields Too Large')
    assert.equal(record.host, 'llm.example')
    assert.equal(record.path, '/v1/chat/completions')
    assert.equal(record.headers.server, 'cloudflare')
    assert.equal(record.headers['cf-ray'], '8f00-SIN')
    assert.equal(record.headers['x-request-id'], 'req-123')
    assert.equal(record.headers['set-cookie'], undefined, 'cookies are not diagnostic headers')
    assert.ok(record.body.includes('invalid_request_error'))
    assert.ok(record.body.includes('sk-[redacted]'), 'credential shapes are redacted')
    assert.equal(JSON.stringify(record).includes('SECRET'), false, 'the query string is never stored')
  } finally {
    diagnostics.uninstall()
    restore()
  }
})

test('a thrown network error keeps its cause chain and is re-thrown unchanged', async () => {
  const root = Object.assign(new Error('other side closed'), {
    code: 'UND_ERR_SOCKET',
    syscall: 'read',
    address: '10.0.0.1',
    port: 443,
  })
  const thrown = new TypeError('fetch failed', { cause: root })
  globalThis.fetch = async () => {
    throw thrown
  }
  const diagnostics = installFetchDiagnostics()
  try {
    await assert.rejects(() => globalThis.fetch('https://llm.example/v1/chat'), (error) => error === thrown)
    const record = diagnostics.latest(5000)
    assert.ok(record, 'a thrown request must be recorded')
    assert.equal(record.kind, 'network')
    assert.equal(record.error.name, 'TypeError')
    assert.equal(record.error.message, 'fetch failed')
    assert.equal(record.error.cause.code, 'UND_ERR_SOCKET')
    assert.equal(record.error.cause.message, 'other side closed')
    assert.equal(record.error.cause.port, 443)
  } finally {
    diagnostics.uninstall()
    restore()
  }
})

test('a broken SSE body is captured as a stream failure with its byte count', async () => {
  let source
  const body = new ReadableStream({ start (controller) { source = controller } })
  globalThis.fetch = async () =>
    new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  const diagnostics = installFetchDiagnostics()
  try {
    const response = await globalThis.fetch('https://llm.example/v1/chat/completions')
    const reader = response.body.getReader()
    source.enqueue(new TextEncoder().encode('data: {"choices":[]}\n\n'))
    const first = await reader.read()
    assert.equal(first.done, false, 'the wrapper forwards the chunks untouched')

    source.error(new TypeError('terminated'))
    await assert.rejects(() => reader.read())

    const record = diagnostics.latest(5000)
    assert.ok(record, 'a broken stream must be recorded even though HTTP returned 200')
    assert.equal(record.kind, 'stream')
    assert.equal(record.status, 200)
    assert.ok(record.bytes > 0, 'it reports how much had arrived')
    assert.equal(record.error.name, 'TypeError')
    assert.equal(record.error.message, 'terminated')
  } finally {
    diagnostics.uninstall()
    restore()
  }
})

test('DONE consumers can cancel concurrent pending pulls without invented stream failures', async () => {
  const delta = encoder.encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n')
  const done = encoder.encode('data: [DONE]\n\n')
  const fixtures = Array.from({ length: 12 }, () => {
    let cancelledWith
    let reads = 0
    let pendingPull
    const pending = new Promise((resolve) => { pendingPull = resolve })
    const body = new ReadableStream({
      start (controller) { controller.enqueue(delta); controller.enqueue(done) },
      cancel (reason) { cancelledWith = reason },
    })
    const getReader = body.getReader.bind(body)
    body.getReader = () => {
      const reader = getReader()
      const read = reader.read.bind(reader)
      reader.read = () => {
        reads++
        const result = read()
        if (reads === 3) pendingPull()
        return result
      }
      return reader
    }
    return { body, pending, cancelledWith: () => cancelledWith }
  })
  let next = 0
  globalThis.fetch = async () => new Response(fixtures[next++].body, { headers: { 'content-type': 'text/event-stream' } })
  const diagnostics = installFetchDiagnostics()
  try {
    await Promise.all(fixtures.map(async (fixture, index) => {
      const response = await diagnostics.run({ attemptId: `done-${index}` }, () => fetch('https://llm.example/v1/chat'))
      const reader = response.body.getReader()
      const first = await reader.read()
      const second = await reader.read()
      assert.equal(first.value, delta, 'the caller receives the original delta bytes')
      assert.equal(second.value, done, 'the caller receives the original DONE bytes')
      await fixture.pending // The wrapper has already started another upstream read.
      const reason = { done: index }
      await reader.cancel(reason)
      assert.equal(fixture.cancelledWith(), reason)
      assert.deepEqual(await reader.read(), { value: undefined, done: true })
    }))
    await tick()
    assert.deepEqual(diagnostics.snapshot(), [], 'consumer cancellation is not an upstream network failure')
  } finally { diagnostics.uninstall(); restore() }
})

test('cancellation settles a caller read while the upstream pull is pending', async () => {
  let readStarted
  let cancelFinished
  const started = new Promise((resolve) => { readStarted = resolve })
  const cancellation = new Promise((resolve) => { cancelFinished = resolve })
  const body = new ReadableStream({
    pull () { readStarted() },
    cancel () { return cancellation },
  })
  globalThis.fetch = async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } })
  const diagnostics = installFetchDiagnostics()
  try {
    const response = await fetch('https://llm.example/v1/chat')
    const reader = response.body.getReader()
    const pending = reader.read()
    await started
    const cancelled = reader.cancel('stop')
    assert.deepEqual(await pending, { value: undefined, done: true })
    await tick() // The upstream read resolves before its asynchronous cancel hook.
    assert.deepEqual(diagnostics.snapshot(), [])
    cancelFinished()
    await cancelled
    assert.deepEqual(diagnostics.snapshot(), [])
  } finally { cancelFinished(); diagnostics.uninstall(); restore() }
})

test('late upstream bytes after cancellation never reach a closed controller', async () => {
  let finishRead
  let started
  const readStarted = new Promise((resolve) => { started = resolve })
  const original = new ReadableStream()
  const read = new Promise((resolve) => { finishRead = resolve })
  original.getReader = () => ({ read () { started(); return read }, cancel () {} })
  globalThis.fetch = async () => new Response(original, { headers: { 'content-type': 'text/event-stream' } })
  const diagnostics = installFetchDiagnostics()
  try {
    const response = await fetch('https://llm.example/v1/chat')
    const reader = response.body.getReader()
    const pending = reader.read()
    await readStarted
    await reader.cancel()
    finishRead({ done: false, value: encoder.encode('late') })
    assert.deepEqual(await pending, { done: true, value: undefined })
    await tick()
    assert.deepEqual(diagnostics.snapshot(), [])
  } finally { diagnostics.uninstall(); restore() }
})

test('a genuine read rejection remains diagnostic evidence when cancellation wins the caller race', async () => {
  let source
  const body = new ReadableStream({ start (controller) { source = controller } })
  const reset = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' })
  globalThis.fetch = async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } })
  const diagnostics = installFetchDiagnostics()
  try {
    const response = await fetch('https://llm.example/v1/chat')
    const reader = response.body.getReader()
    const pending = reader.read()
    source.error(reset)
    await assert.rejects(reader.cancel('finished'), (error) => error === reset)
    assert.deepEqual(await pending, { done: true, value: undefined })
    await tick()
    assert.equal(diagnostics.snapshot().length, 1)
    assert.equal(diagnostics.snapshot()[0].error.code, 'ECONNRESET')
  } finally { diagnostics.uninstall(); restore() }
})

test('local controller faults propagate without being recorded as upstream read failures', async () => {
  const NativeReadableStream = globalThis.ReadableStream
  const bytes = encoder.encode('data: [DONE]\n\n')
  const response = new Response(bytes, { headers: { 'content-type': 'text/event-stream' } })
  const localFault = Object.assign(new TypeError('local controller enqueue failed'), { code: 'ERR_INVALID_STATE' })
  globalThis.fetch = async () => response
  const diagnostics = installFetchDiagnostics()
  try {
    globalThis.ReadableStream = class extends NativeReadableStream {
      constructor (source, strategy) {
        super({ ...source, pull: (controller) => source.pull({
          close: () => controller.close(),
          error: (error) => controller.error(error),
          enqueue: () => { throw localFault },
        }) }, strategy)
      }
    }
    const watched = await fetch('https://llm.example/v1/chat')
    globalThis.ReadableStream = NativeReadableStream
    await assert.rejects(watched.text(), (error) => error === localFault)
    assert.deepEqual(diagnostics.snapshot(), [])
  } finally { globalThis.ReadableStream = NativeReadableStream; diagnostics.uninstall(); restore() }
})

test('SSE response URL, type, redirected metadata and caller bytes survive wrapping', async () => {
  const bytes = encoder.encode('data: [DONE]\n\n')
  const response = new Response(bytes, { status: 200, statusText: 'OK', headers: { 'content-type': 'text/event-stream', 'x-request-id': 'original' } })
  Object.defineProperties(response, {
    url: { value: 'https://llm.example/redirected/chat' },
    type: { value: 'cors' },
    redirected: { value: true },
  })
  globalThis.fetch = async () => response
  const diagnostics = installFetchDiagnostics()
  try {
    const watched = await fetch('https://llm.example/v1/chat')
    assert.equal(watched.url, response.url)
    assert.equal(watched.type, response.type)
    assert.equal(watched.redirected, response.redirected)
    assert.equal(watched.status, response.status)
    assert.equal(watched.statusText, response.statusText)
    assert.equal(watched.headers.get('x-request-id'), 'original')
    assert.deepEqual(new Uint8Array(await watched.arrayBuffer()), bytes)
    assert.deepEqual(diagnostics.snapshot(), [])
  } finally { diagnostics.uninstall(); restore() }
})

test('a genuine pending SSE reset is propagated unchanged and captured once', async () => {
  let source
  const bytes = encoder.encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n')
  const reset = Object.assign(new TypeError('terminated'), { cause: Object.assign(new Error('other side closed'), { code: 'ECONNRESET' }) })
  const body = new ReadableStream({ start (controller) { source = controller; controller.enqueue(bytes) } })
  globalThis.fetch = async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } })
  const diagnostics = installFetchDiagnostics()
  try {
    const response = await fetch('https://llm.example/v1/chat')
    const reader = response.body.getReader()
    assert.equal((await reader.read()).value, bytes)
    const pending = reader.read()
    source.error(reset)
    await assert.rejects(pending, (error) => error === reset)
    assert.equal(diagnostics.snapshot().length, 1)
    const record = diagnostics.snapshot()[0]
    assert.equal(record.kind, 'stream')
    assert.equal(record.bytes, bytes.byteLength)
    assert.equal(record.error.message, 'terminated')
    assert.equal(record.error.cause.code, 'ECONNRESET')
  } finally { diagnostics.uninstall(); restore() }
})

test('a clean SSE stream is not recorded as a failure', async () => {
  const body = new ReadableStream({
    start (controller) {
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
  globalThis.fetch = async () =>
    new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  const diagnostics = installFetchDiagnostics()
  try {
    const response = await globalThis.fetch('https://llm.example/v1/chat/completions')
    const text = await response.text()
    assert.ok(text.includes('[DONE]'), 'the body survives the wrapper')
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(diagnostics.snapshot().length, 0)
  } finally {
    diagnostics.uninstall()
    restore()
  }
})

test('only failed requests are recorded, and only for the configured hosts', async () => {
  let calls = 0
  globalThis.fetch = async (input) => {
    calls += 1
    if (String(input).includes('ok.example')) return new Response('fine', { status: 200 })
    return new Response('nope', { status: 500, headers: { server: 'edge' } })
  }
  const diagnostics = installFetchDiagnostics({ hosts: ['llm.example'] })
  try {
    await globalThis.fetch('https://ok.example/health')
    await globalThis.fetch('https://other.example/v1/chat')
    assert.equal(diagnostics.snapshot().length, 0, 'successes and non-configured hosts stay out')

    await globalThis.fetch('https://llm.example/v1/chat')
    await new Promise((resolve) => setTimeout(resolve, 10))
    const records = diagnostics.snapshot()
    assert.equal(records.length, 1)
    assert.equal(records[0].host, 'llm.example')
    assert.equal(calls, 3)
  } finally {
    diagnostics.uninstall()
    restore()
  }
})

test('consumed records are not paired twice', async () => {
  globalThis.fetch = async () => new Response('x', { status: 502 })
  const diagnostics = installFetchDiagnostics()
  try {
    await globalThis.fetch('https://llm.example/v1/chat')
    await new Promise((resolve) => setTimeout(resolve, 5))
    const first = diagnostics.latest(5000)
    assert.ok(first)
    diagnostics.consume(first.id)
    assert.equal(diagnostics.latest(5000), undefined)
  } finally {
    diagnostics.uninstall()
    restore()
  }
})

test('uninstall restores the previous fetch only while it is still installed', () => {
  const fake = async () => new Response('x')
  globalThis.fetch = fake
  const diagnostics = installFetchDiagnostics()
  const guarded = globalThis.fetch
  assert.notEqual(guarded, fake)
  diagnostics.uninstall()
  assert.equal(globalThis.fetch, fake)

  // If something else replaced fetch after installation, uninstall must not
  // clobber that newer wrapper.
  const again = installFetchDiagnostics()
  globalThis.fetch = async () => new Response('other')
  const newer = globalThis.fetch
  again.uninstall()
  assert.equal(globalThis.fetch, newer)
  restore()
})

test('address and redaction helpers keep their contracts', () => {
  assert.deepEqual(requestAddress('https://GW.Example:8443/v1/chat?api_key=SECRET'), {
    host: 'gw.example:8443',
    path: '/v1/chat',
  })
  assert.equal(requestAddress('not a url'), undefined)
  assert.deepEqual(requestAddress(new URL('https://example.com/x')), { host: 'example.com', path: '/x' })

  assert.equal(redactSecrets('Authorization: Bearer abcdefghijklmnop'), 'Authorization: Bearer [redacted]')
  assert.equal(redactSecrets('key sk-abcdefghijklmnopqrst'), 'key sk-[redacted]')
  assert.equal(redactSecrets('api_key=abcdefghijklmnop'), 'api_key=[redacted]')

  const described = describeError(new Error('outer', { cause: Object.assign(new Error('inner'), { code: 'ECONNRESET' }) }))
  assert.equal(described.message, 'outer')
  assert.equal(described.cause.code, 'ECONNRESET')
})

test('near() finds the failure record closest to one instant and leaves it unconsumed', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('', { status: 502, statusText: 'Bad Gateway' })
  const diagnostics = installFetchDiagnostics()
  try {
    await globalThis.fetch('https://gw.example/v1/chat/completions')
    await new Promise((resolve) => setTimeout(resolve, 25))
    const later = await (async () => {
      await globalThis.fetch('https://gw.example/v1/chat/completions')
      return Date.now()
    })()
    const at = diagnostics.near(later, 5000)
    assert.ok(at !== undefined, 'the recent failure is within the tolerance')
    assert.equal(at.status, 502)
    assert.equal(at.consumedAt, undefined, 'a near() lookup never consumes the record')
    assert.equal(diagnostics.latest(5000, later + 1)?.id, at.id, 'latest() still sees it afterwards')
    assert.equal(diagnostics.near(0, 1000), undefined, 'nothing that far back is evidence')
  } finally {
    diagnostics.uninstall()
    globalThis.fetch = original
  }
})

test('distinct same-host undici errors survive while exact identities deduplicate', () => {
  const d = installFetchDiagnostics()
  try {
    const a = { origin: 'https://same.example', path: '/a?token=hidden' }
    const b = { origin: 'https://same.example', path: '/b' }
    const ea = Object.assign(new Error('a'), { code: 'ERR_A' })
    const eb = Object.assign(new Error('b'), { code: 'ERR_B' })
    channel('undici:request:error').publish({ request: a, error: ea })
    channel('undici:request:error').publish({ request: b, error: eb })
    channel('undici:request:error').publish({ request: a, error: new Error('wrapper', { cause: ea }) })
    assert.deepEqual(d.snapshot().map((r) => r.error.code), ['ERR_A', 'ERR_B'])
    assert.equal(d.snapshot()[0].path, '/a')
  } finally { d.uninstall() }
})

test('fetch and undici exact cause echoes become one network record', async () => {
  const request = { origin: 'https://same.example', path: '/a' }
  const cause = Object.assign(new Error('reset'), { code: 'ECONNRESET' })
  const thrown = new TypeError('fetch failed', { cause })
  globalThis.fetch = async () => { channel('undici:request:error').publish({ request, error: cause }); throw thrown }
  const d = installFetchDiagnostics()
  try {
    await assert.rejects(d.run({ attemptId: 'a' }, () => fetch('https://same.example/a')), (e) => e === thrown)
    assert.equal(d.recordsFor('a').length, 1)
    assert.equal(d.recordsFor('a')[0].kind, 'network')
    assert.equal(d.recordsFor('a')[0].error.cause.code, 'ECONNRESET')
  } finally { d.uninstall(); restore() }
})

test('ALS separates parallel attempts and leaves unscoped captures unassigned', async () => {
  const pending = new Map()
  globalThis.fetch = (url) => new Promise((resolve, reject) => pending.set(url, reject))
  const d = installFetchDiagnostics()
  try {
    const aContext = Object.assign(Object.create(null), { attemptId: 'a', sessionId: 'sa', provider: 'pa', purpose: 'agent', startedAt: 12, token: 'never' })
    const inherited = Object.create({ sessionId: 'not-own' }); inherited.attemptId = 'b'
    const a = d.run(aContext, () => fetch('https://same.example/a')).catch((e) => e)
    const b = d.run(inherited, () => fetch('https://same.example/b')).catch((e) => e)
    const global = fetch('https://same.example/global').catch((e) => e)
    pending.get('https://same.example/b')(new Error('b'))
    pending.get('https://same.example/global')(new Error('global'))
    pending.get('https://same.example/a')(new Error('a'))
    await Promise.all([a, b, global])
    assert.deepEqual(d.recordsFor('a')[0].context, { attemptId: 'a', sessionId: 'sa', provider: 'pa', purpose: 'agent', startedAt: 12 })
    assert.deepEqual(d.recordsFor('b')[0].context, { attemptId: 'b' })
    assert.equal(d.recordsFor('a').length, 1)
    assert.equal(d.recordsFor('b').length, 1)
    assert.equal(d.snapshot().find((r) => r.path === '/global').context, undefined)
    d.consume(d.recordsFor('a')[0].id)
    assert.equal(d.recordsFor('a').length, 1)
    const promise = Promise.resolve(123)
    assert.equal(d.run({}, () => promise), promise)
    const marker = {}; assert.equal(d.run({}, () => marker), marker)
    assert.throws(() => d.run({}, () => { throw new Error('sync') }), /sync/)
  } finally { d.uninstall(); restore() }
})

test('undici create and SSE callbacks retain request-start context', async () => {
  const request = { origin: 'https://same.example', path: '/channel' }
  let controller
  globalThis.fetch = async () => new Response(new ReadableStream({ start (c) { controller = c } }), { headers: { 'content-type': 'text/event-stream' } })
  const d = installFetchDiagnostics()
  try {
    d.run({ attemptId: 'origin' }, () => channel('undici:request:create').publish({ request }))
    d.run({ attemptId: 'wrong' }, () => channel('undici:request:error').publish({ request, error: new Error('channel failure') }))
    const response = await d.run({ attemptId: 'stream' }, () => fetch('https://same.example/stream'))
    const reader = response.body.getReader()
    controller.error(new Error('stream failure'))
    await d.run({ attemptId: 'wrong' }, () => assert.rejects(reader.read()))
    assert.equal(d.recordsFor('origin').length, 1)
    assert.equal(d.recordsFor('stream').length, 1)
    assert.equal(d.recordsFor('wrong').length, 0)
  } finally { d.uninstall(); restore() }
})

test('HTTP body is pending immediately then completes without consuming caller response', async () => {
  let controller
  globalThis.fetch = async () => new Response(new ReadableStream({ start (c) { controller = c } }), { status: 429 })
  const d = installFetchDiagnostics()
  try {
    const response = await d.run({ attemptId: 'body' }, () => fetch('https://same.example/body'))
    const record = d.recordsFor('body')[0]
    assert.equal(record.bodyState, 'pending'); assert.equal(record.body, '')
    const text = '{"error":{"code":"insufficient_quota"}}'
    controller.enqueue(encoder.encode(text)); controller.close()
    assert.equal(await response.text(), text)
    await waitBody(record)
    assert.equal(record.bodyState, 'complete'); assert.equal(record.body, text)
    assert.equal(record.bodyBytes, encoder.encode(text).length)
  } finally { d.uninstall(); restore() }
})

test('unknown-length oversize body is bounded and a credential crossing its cap is redacted', async () => {
  let pulls = 0
  globalThis.fetch = async () => new Response(new ReadableStream({ pull (c) {
    pulls++; c.enqueue(encoder.encode(pulls === 1 ? 'api_key=abcdefghijklmno-SECRET' : 'x'.repeat(10000)))
  } }), { status: 500 })
  const d = installFetchDiagnostics({ maxBodyBytes: 12, maxBodyChars: 64 })
  let response
  try {
    response = await fetch('https://same.example/large')
    const record = d.latest(); await waitBody(record)
    assert.equal(record.bodyState, 'truncated'); assert.equal(record.bodyBytes, 12); assert.equal(record.bodyLimit, 12)
    assert.doesNotMatch(record.body, /abcd|SECRET/); assert.match(record.body, /redacted/)
    assert.ok(pulls < 10, 'diagnostics stop pulling after bounded prefix')
  } finally { d.uninstall(); void response?.body.cancel().catch(() => {}); restore() }
})

test('body read failure is unreadable rather than falsely empty', async () => {
  let controller
  globalThis.fetch = async () => new Response(new ReadableStream({ start (c) { controller = c } }), { status: 500 })
  const d = installFetchDiagnostics()
  try {
    const response = await fetch('https://same.example/broken'); const record = d.latest()
    controller.error(new Error('body broken'))
    await assert.rejects(response.text(), /body broken/); await waitBody(record)
    assert.equal(record.bodyState, 'unreadable'); assert.equal(record.bodyReason, 'read-error')
  } finally { d.uninstall(); restore() }
})

test('deadline and uninstall stop detached reads without awaiting tee peer cancellation', async () => {
  globalThis.fetch = async () => new Response(new ReadableStream({}), { status: 500 })
  const d = installFetchDiagnostics({ bodyReadTimeoutMs: 15 })
  let response
  try {
    response = await fetch('https://same.example/deadline'); const record = d.latest()
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(record.bodyState, 'unreadable'); assert.equal(record.bodyReason, 'deadline')
  } finally { d.uninstall(); void response?.body.cancel().catch(() => {}); restore() }
  globalThis.fetch = async () => new Response(new ReadableStream({}), { status: 500 })
  const next = installFetchDiagnostics({ bodyReadTimeoutMs: 10000 })
  response = await fetch('https://same.example/uninstall'); const record = next.latest()
  next.uninstall()
  assert.equal(record.bodyState, 'unreadable'); assert.equal(record.bodyReason, 'uninstalled')
  void response.body.cancel().catch(() => {}); restore()
})

test('body caps redact credential prefixes across chunks and preserve caller bytes', async () => {
  for (const [secret, limit] of [['Bearer abcdefghijk', 10], ['sk-abcdefghijk', 7], ['token=abcdefghijk', 10]]) {
    const chunks = [secret.slice(0, 2), secret.slice(2)]
    globalThis.fetch = async () => new Response(new ReadableStream({ start (c) {
      for (const chunk of chunks) c.enqueue(encoder.encode(chunk)); c.close()
    } }), { status: 500 })
    const d = installFetchDiagnostics({ maxBodyBytes: limit, maxBodyChars: 100 })
    try {
      const response = await fetch('https://same.example/secret'); const record = d.latest()
      assert.equal(await response.text(), secret)
      await waitBody(record)
      assert.equal(record.bodyState, 'truncated')
      assert.doesNotMatch(record.body, /abc|def|ghi/)
      assert.match(record.body, /redacted/)
    } finally { d.uninstall(); restore() }
  }
  globalThis.fetch = async () => new Response('ordinary long message', { status: 500 })
  const d = installFetchDiagnostics({ maxBodyBytes: 100, maxBodyChars: 5 })
  try {
    await fetch('https://same.example/chars'); const record = d.latest(); await waitBody(record)
    assert.equal(record.body, 'ordin'); assert.equal(record.bodyState, 'truncated')
  } finally { d.uninstall(); restore() }
})

test('iterator next scopes are independent and reused errors never move between attempts', async () => {
  const error = new Error('reused')
  globalThis.fetch = async () => { throw error }
  const d = installFetchDiagnostics()
  async function* stream () { yield await fetch('https://same.example/iterator') }
  try {
    await assert.rejects(fetch('https://same.example/global-reused'))
    const unscoped = d.snapshot().find((r) => r.path === '/global-reused')
    const a = stream()[Symbol.asyncIterator]()
    const b = stream()[Symbol.asyncIterator]()
    await assert.rejects(d.run({ attemptId: 'a' }, () => a.next()))
    await assert.rejects(d.run({ attemptId: 'b' }, () => b.next()))
    assert.equal(d.recordsFor('a').length, 1); assert.equal(d.recordsFor('b').length, 1)
    assert.notEqual(d.recordsFor('a')[0], d.recordsFor('b')[0])
    assert.equal(unscoped.context, undefined)
    assert.equal(d.snapshot().length, 3)
    const detached = Object.create({ attemptId: 'must-not-inherit' })
    assert.equal(d.run(detached, () => 5), 5)
    assert.equal(d.recordsFor('must-not-inherit').length, 0)
  } finally { d.uninstall(); restore() }
})

test('non-success SSE bodies are explicitly skipped', async () => {
  globalThis.fetch = async () => new Response('data: secret', { status: 500, headers: { 'content-type': 'text/event-stream' } })
  const d = installFetchDiagnostics()
  try {
    const response = await fetch('https://same.example/sse-error'); const record = d.latest()
    assert.equal(record.bodyState, 'skipped'); assert.equal(record.bodyReason, 'event-stream')
    assert.equal(await response.text(), 'data: secret')
  } finally { d.uninstall(); restore() }
})
