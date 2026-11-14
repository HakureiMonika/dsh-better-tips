import { test } from 'node:test'
import assert from 'node:assert/strict'

/** Test the real browser factory; DOM/React shims prove data contracts, not layout. */
let registration
let hooks = null
globalThis.window = { __ModuleLoader__: { load (value) { registration = value } } }
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ dataset: {}, textContent: '', remove () {} }),
  head: { appendChild () {} },
}
const React = {
  Fragment: Symbol('Fragment'),
  createElement (type, props, ...children) {
    return { type, props: props ?? {}, children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false) }
  },
  memo: (component) => component,
  useState: (initial) => hooks.useState(initial),
  useEffect: (callback, dependencies) => hooks.useEffect(callback, dependencies),
  useMemo: (callback) => callback(),
  useCallback: (callback) => callback,
  useRef: (initial) => hooks.useRef(initial),
}
await import('../client.js')
assert.equal(registration?.id, 'dsh-better-tips')
assert.equal(typeof registration.factory, 'function')

function mountFactory (sessions) {
  const slots = []
  const definitions = []
  const injectionKeys = []
  const disposers = []
  let locale
  const occupied = new Map(['turn-error', 'model-retry', 'compaction', 'manual-compaction'].map((key) => [`conversation.chat.node:${key}:0`, { shipped: true }]))
  const module = registration.factory((id) => { assert.equal(id, 'react'); return React })
  const ctx = {
    get (name) { assert.equal(name, 'sessions'); return sessions },
    effect (callback) {
      const dispose = callback()
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
    locale: { register (namespace, dictionaries) { locale = { namespace, dictionaries }; return () => {} } },
    uiConversation: { events: { register (definition) { definitions.push(definition); return () => {} } } },
    slots: {
      inject (name, callback) {
        injectionKeys.push(name)
        const effect = callback()
        const owned = typeof effect === 'function' ? [effect] : [...effect]
        const dispose = () => { for (const item of owned.toReversed()) item() }
        disposers.push(dispose)
        return dispose
      },
      register (options, component) {
        const cell = `${options.name}:${options.key ?? options.id}:${options.priority ?? 0}`
        assert.equal(occupied.has(cell), false, `SlotCore rejects duplicate ${cell}`)
        slots.push({ options, component })
        occupied.set(cell, component)
        return () => occupied.delete(cell)
      },
    },
  }
  module.apply(ctx)
  const dictionary = locale?.dictionaries?.zh
  const t = (key, parameters = {}) => {
    assert.equal(typeof dictionary?.[key], 'string', `missing actual Chinese translation ${key}`)
    return dictionary[key].replace(/\{([^{}]+)\}/g, (match, name) => Object.hasOwn(parameters, name) ? String(parameters[name]) : match)
  }
  return {
    module, slots, definitions, injectionKeys, locale, t, occupied,
    row (key) { const row = slots.find((entry) => entry.options.key === key); assert.ok(row, `missing row ${key}`); return row.component },
    dispose () { for (const dispose of disposers.toReversed()) dispose() },
  }
}
const client = mountFactory()

function materialize (node) {
  if (Array.isArray(node)) return node.map(materialize)
  if (node === null || node === undefined || typeof node !== 'object') return node
  if (typeof node.type === 'function') return materialize(node.type({ ...node.props, children: node.children }))
  return { ...node, children: node.children.map(materialize) }
}
/** false = complete evidence; true = DOM-visible text; 'collapsed' = default summaries. */
function text (node, collapsed = false) {
  if (Array.isArray(node)) return node.map((child) => text(child, collapsed)).join(' ')
  if (node === null || node === undefined || node === false) return ''
  if (typeof node !== 'object') return String(node)
  if (node.props?.hidden || node.props?.['aria-hidden'] === true) return ''
  const hideBody = node.type === 'details' && (collapsed === 'collapsed' || (collapsed && !node.props.open))
  const children = hideBody ? node.children.filter((child) => child?.type === 'summary') : node.children
  return children.map((child) => text(child, collapsed)).join(' ')
}
function elements (node, type) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, type))
  return [...(node.type === type ? [node] : []), ...node.children.flatMap((child) => elements(child, type))]
}

function withClass (node, className, outsideDetails = false) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap((child) => withClass(child, className, outsideDetails))
  if (outsideDetails && node.type === 'details') return []
  const matches = String(node.props?.className ?? '').split(/\s+/).includes(className)
  return [...(matches ? [node] : []), ...node.children.flatMap((child) => withClass(child, className, outsideDetails))]
}
function assertMainAdvice (row, fragment) {
  const advice = withClass(row.tree, 'bt_advice')
  assert.equal(advice.length, 1, 'each failure has exactly one main advice block')
  assert.equal(withClass(row.tree, 'bt_advice', true).length, 1, 'main advice is outside every collapsed disclosure')
  const value = text(advice[0])
  assert.ok(value.includes('排查'), 'main advice has the concise 排查 label')
  assert.ok(row.primary.includes(value), 'main advice stays visible with details collapsed')
  if (fragment) assert.ok(value.includes(fragment), `expected advice ${JSON.stringify(fragment)}, got ${JSON.stringify(value)}`)
  return value
}
function assertOriginal (row, original) {
  const expected = [original.code ? `[${original.code}]` : '', original.message].filter(Boolean).join(' ')
  const originals = [...withClass(row.tree, 'bt_original'), ...withClass(row.tree, 'bt_preview'), ...withClass(row.tree, 'bt_attemptPreview')]
  assert.ok(originals.some((node) => text(node) === expected), 'complete original remains verbatim in either its unchanged preview or full-original disclosure')
  const fallback = withClass(row.tree, 'bt_nativeFallback', true)
  assert.equal(withClass(row.tree, 'bt_original', true).length, fallback.length ? 1 : 0, 'only explicit native fallback may show complete original by default')
  assert.ok(row.full.includes(expected), 'full error evidence is retained')
}
function assertCaptureAdvice (row, fragment) {
  const advice = withClass(row.tree, 'bt_captureAdvice')
  assert.ok(advice.length > 0, 'capture-specific advice is available')
  assert.ok(advice.every((node) => text(node).includes('排查')), 'capture-specific advice stays explicitly labelled')
  assert.ok(advice.some((node) => text(node).includes(fragment)), `missing capture-specific advice ${fragment}`)
}

/** Hook instances follow component type/key/path, rather than sharing sibling state. */
async function renderRow (key, props, {
  response = { items: [], records: [], capture: { installed: true, records: 0 } },
  error, status, pending = false, sessions, clickLog = false, interact, respond, timers, environment, environmentRespond,
  openDetails = true,
} = {}) {
  const mounted = mountFactory(sessions)
  const originalFetch = globalThis.fetch
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  if (timers) { globalThis.setTimeout = timers.set; globalThis.clearTimeout = timers.clear }
  const calls = []
  const environmentCalls = []
  const instances = new Map()
  const domOpen = new Map()
  const typeIds = new Map()
  let nextType = 0
  let dirty = false
  let current
  let currentProps = props
  let renderedInstances
  const typeId = (type) => { if (!typeIds.has(type)) typeIds.set(type, ++nextType); return typeIds.get(type) }
  globalThis.fetch = (url, options) => {
    if (String(url) === 'api/better-tips/environment') {
      environmentCalls.push({ url: String(url), options })
      if (environmentRespond) return environmentRespond(options, environmentCalls.length)
      return Promise.resolve({ ok: true, json: async () => environment ?? { runtime: {
        ...response?.runtime, enabledPlugins: [{ name: 'dsh-better-tips', version: '0.12.0' }], pluginsStatus: 'complete' } } })
    }
    calls.push({ url: String(url), options })
    if (respond) return respond(String(url), options, calls.length)
    if (pending) return new Promise(() => {})
    if (error) return Promise.reject(error)
    return Promise.resolve({ ok: status === undefined, status: status ?? 200, json: async () => response })
  }
  function render (node, path = 'root') {
    if (Array.isArray(node)) return node.map((child, index) => render(child, `${path}/${child?.props?.key ?? index}`))
    if (node === null || node === undefined || typeof node !== 'object') return node
    if (typeof node.type === 'function') {
      const identity = `${path}/component-${typeId(node.type)}:${node.props?.key ?? ''}`
      const instance = instances.get(identity) ?? { cells: [], cursor: 0, effects: [] }
      instances.set(identity, instance)
      renderedInstances.add(identity)
      instance.cursor = 0
      instance.effects = []
      const cells = instance.cells
      hooks = {
        useState (initial) {
          const index = instance.cursor++
          cells[index] ??= { value: typeof initial === 'function' ? initial() : initial }
          const cell = cells[index]
          return [cell.value, (next) => {
            const value = typeof next === 'function' ? next(cell.value) : next
            if (!Object.is(value, cell.value)) { cell.value = value; dirty = true }
          }]
        },
        useEffect (callback, dependencies) {
          const index = instance.cursor++
          const previous = cells[index]
          const changed = previous === undefined || dependencies === undefined || dependencies.length !== previous.dependencies?.length || dependencies.some((value, i) => !Object.is(value, previous.dependencies?.[i]))
          if (changed) instance.effects.push(() => { previous?.cleanup?.(); cells[index] = { dependencies, cleanup: callback() } })
        },
        useRef (initial) { const index = instance.cursor++; cells[index] ??= { current: initial }; return cells[index] },
      }
      const output = node.type({ ...node.props, children: node.children })
      hooks = null
      return render(output, identity)
    }
    const result = { ...node, props: { ...node.props }, testPath: path }
    if (node.type === 'details' && node.props.open === undefined) result.props.open = domOpen.get(path) ?? false
    result.children = node.children.map((child, index) => render(child, `${path}/${child?.props?.key ?? index}`))
    return result
  }
  const snapshot = (tree) => ({ tree, calls, environmentCalls, primary: text(tree, 'collapsed'), visible: text(tree, true), full: text(tree) })
  const settle = async () => {
    for (let pass = 0; pass < 30; pass++) {
      dirty = false
      renderedInstances = new Set()
      const tree = render(React.createElement(mounted.row(key), { ...currentProps, t: mounted.t }))
      for (const [identity, instance] of instances) {
        if (!renderedInstances.has(identity)) { for (const cell of instance.cells) cell?.cleanup?.(); instances.delete(identity) }
        else for (const effect of instance.effects) effect()
      }
      await new Promise((resolve) => setImmediate(resolve))
      current = snapshot(tree)
      if (!dirty) return current
    }
    assert.fail('row hooks did not settle')
  }
  const toggle = async (node, open = !node.props.open) => {
    assert.ok(node && node.type === 'details', 'toggle target is a disclosure')
    domOpen.set(node.testPath, open)
    node.props.onToggle?.({ currentTarget: { open } })
    return settle()
  }
  const click = async (node) => {
    assert.ok(node, 'click target exists')
    assert.notEqual(node.props.disabled, true, 'click target is not disabled')
    assert.equal(typeof node.props.onClick, 'function', 'click target has a handler')
    await node.props.onClick({ preventDefault () {}, stopPropagation () {} })
    return settle()
  }
  const update = async (next) => { currentProps = next; return settle() }
  try {
    const beforeDisclosure = { ...await settle(), calls: [...calls] }
    if (openDetails) {
      const disclosure = withClass(current.tree, 'bt_disclosure')[0] ?? withClass(current.tree, 'bt_compact')[0]
      if (disclosure?.type === 'details') await toggle(disclosure, true)
    }
    const beforeOpen = { ...current, calls: [...calls] }
    if (clickLog) {
      const buttons = withClass(current.tree, 'bt_logButton')
      assert.equal(buttons.length, 1, 'one log opener per single-record row')
      await click(buttons[0])
    }
    if (interact) await interact({ get row () { return current }, click, toggle, settle, update, beforeOpen, beforeDisclosure })
    return { ...current, beforeOpen, beforeDisclosure }
  } finally {
    hooks = null
    for (const instance of instances.values()) for (const cell of instance.cells) cell?.cleanup?.()
    mounted.dispose()
    globalThis.fetch = originalFetch
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
  }
}

const failure = { message: 'Connection error.', code: 'TRANSPORT' }
const terminal = (message = failure.message, code = failure.code, step = 3) => ({ sessionId: 'session-client-test', node: { data: { turn: 9, step, message, code } } })
const retry = (message = failure.message, code = failure.code, step = 3, retryState = 'started') => ({
  sessionId: 'session-client-test',
  node: { data: { current: { turn: 9, step, retry: 2, maxRetries: 5, mode: 'normal', delayMs: 987, retryState, failure: { message, code } } } },
})
function socket (overrides = {}) {
  return {
    step: 3, failure, lagMs: 7, provenance: 'request-context', attemptId: 'fixture-attempt', context: { sessionId: 'session-client-test', provider: 'test-provider', attemptId: 'fixture-attempt' },
    detail: {
      kind: 'network', host: 'gateway.example', path: '/v1/chat/completions', elapsedMs: 765432,
      error: { name: 'TypeError', message: 'fetch failed', cause: { name: 'Error', message: 'socket wrapper', cause: { name: 'Error', message: 'read ECONNRESET', code: 'ECONNRESET', syscall: 'read', address: '10.0.0.1', port: 443 } } },
    },
    ...overrides,
  }
}
function http (status, statusText, rawFailure = { message: `${status} status code (no body)`, code: 'SERVER' }, overrides = {}) {
  return {
    step: 3, failure: rawFailure, lagMs: 5, provenance: 'request-context', attemptId: 'fixture-attempt', context: { sessionId: 'session-client-test', provider: 'test-provider', attemptId: 'fixture-attempt' },
    detail: { kind: 'response', host: 'gateway.example', path: '/v1/chat/completions', status, statusText, elapsedMs: 765432, headers: { server: 'Caddy', 'x-request-id': 'request-debug-id' }, body: `raw-response-${status}\nprovider detail` },
    ...overrides,
  }
}
const details = (items) => ({ items, capture: { installed: true, records: 78, recent: [] } })
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const jsonResult = (data) => ({ ok: true, json: async () => data })
async function withClipboard (operation, write) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const copied = []
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: write ?? (async (value) => { copied.push(value) }) } } })
  try { return await operation(copied) } finally {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous)
    else delete globalThis.navigator
  }
}
const reportPayload = (items = [socket()]) => ({ ...details(items), runtime: { dshVersion: '0.2.2-rc.2', pluginVersion: '0.12.0' } })

function assertQuiet (primary) {
  assert.doesNotMatch(primary, /gateway\.example|\/v1\/chat\/completions|Caddy|765432|765\.4|request-debug-id/)
  assert.doesNotMatch(primary, /推测|可能是同一次|例如|捕获器|进程内失败|本轮命中|未捕获|读取失败|正在读取|暂无捕获|连接失败（|没有保留原因/)
}

test('advice and report follow capture; raw details and native error are sibling disclosures', async () => {
  const row = await renderRow('turn-error', terminal(), { openDetails: false, response: reportPayload() })
  const children = row.tree.children
  const index = (name) => children.findIndex((node) => String(node.props?.className ?? '').split(/\s+/).includes(name))
  assert.ok(index('bt_network') < index('bt_advice'))
  assert.ok(index('bt_advice') < index('bt_report'))
  assert.ok(index('bt_report') < index('bt_detailPair'))
  assert.equal(withClass(row.tree, 'bt_failureTitle').length, 1)
  const pair = withClass(row.tree, 'bt_detailPair')[0]
  assert.equal(pair.children.length, 2)
  assert.ok(pair.children.every((node) => node.type === 'details'))
  assert.match(text(pair.children[0].children[0]), /底层原始详情/)
  assert.match(text(pair.children[1].children[0]), /DSH 原生报错/)
  assert.equal(withClass(withClass(row.tree, 'bt_network')[0], 'bt_networkDetails').length, 0)
})

test('retry screenshot keeps current error then one advice before copy and folded history', async () => {
  const first = { ...retry().node.data.current, seq: 10, retry: 1 }
  const second = { ...retry().node.data.current, seq: 20, retry: 2 }
  const row = await renderRow('model-retry', { ...retry(), node: { data: { attempts: [first, second], current: second } } }, { openDetails: false, response: details([socket()]) })
  assert.equal(row.tree.children[0].props.className, 'bt_failureTitle')
  assert.equal(row.tree.children[1].props.className, 'bt_section bt_history')
  const history = withClass(row.tree, 'bt_history')[0]
  assert.equal(history.children[0].props.key, 20)
  assert.equal(history.children[1].props.className, 'bt_earlierErrors')
  const latest = history.children[0]
  const classes = latest.children.map((entry) => entry.props?.className ?? '')
  assert.equal(classes[0], 'bt_section bt_network')
  assert.equal(classes[1], 'bt_captureAdvice bt_advice')
  assert.equal(classes[2], 'bt_actions')
  assert.equal(classes[3], 'bt_report')
  assert.equal(classes[4], 'bt_detailPair')
  assert.equal(withClass(latest, 'bt_heading', true).filter((entry) => /已重试|重试记录|失败记录/.test(text(entry))).length, 0)
  assert.equal(withClass(row.tree, 'bt_advice', true).length, 1)
  assert.equal(row.visible.match(/排查/g)?.length, 1)
  assert.doesNotMatch(row.visible, /重试记录 ·|按发生顺序|失败记录 2/)
})

test('a new nonconsecutive error folds the previous card and aborts pending evidence', async () => {
  const old = { key: 'old', kind: 'turn-error', visibility: 'visible', data: terminal().node.data }
  const later = { key: 'later', kind: 'model-retry', visibility: 'visible', data: retry().node.data }
  const answer = { key: 'answer', kind: 'assistant-step', visibility: 'visible', data: {} }
  let nodes = [old, answer]
  const useChat = (selector) => selector({ order: nodes.map((node) => node.key), nodes: new Map(nodes.map((node) => [node.key, node])) })
  const waiting = deferred()
  await renderRow('turn-error', { ...terminal(), node: old, useChat }, { openDetails: false, respond: () => waiting.promise, interact: async ({ row, update, settle }) => {
    assert.equal(row.calls.length, 1)
    nodes = [old, answer, later]
    let next = await update({ ...terminal(), node: old, useChat })
    assert.equal(next.calls[0].options.signal.aborted, true)
    assert.equal(withClass(next.tree, 'bt_earlierNode')[0].props.open, false)
    waiting.resolve(jsonResult(details([socket({ detail: { ...socket().detail, error: { message: 'LATE_OLD_ERROR' } } })])))
    next = await settle()
    assert.doesNotMatch(next.full, /LATE_OLD_ERROR/)
    assert.equal(next.calls.length, 1)
  } })
})

test('session identity change resets both native and raw disclosures', async () => {
  const props = { ...terminal(), node: { ...terminal().node, key: 'stable', kind: 'turn-error' } }
  await renderRow('turn-error', props, { openDetails: false, response: details([socket()]), interact: async ({ row, toggle, update }) => {
    row = await toggle(withClass(row.tree, 'bt_disclosure')[0], true)
    row = await toggle(withClass(row.tree, 'bt_networkDetails')[0], true)
    assert.equal(withClass(row.tree, 'bt_disclosure')[0].props.open, true)
    const next = await update({ ...props, sessionId: 'session-other' })
    assert.equal(withClass(next.tree, 'bt_disclosure')[0].props.open, false)
    assert.equal(withClass(next.tree, 'bt_networkDetails')[0].props.open, false)
    assert.ok(next.calls[0].options.signal.aborted)
  } })
})

test('screenshot HTTP JSON case defaults to capture and opens complete native original in one layer', async () => {
  const body = JSON.stringify({ error: { message: 'unknown provider for model example-model', type: 'invalid_request_error' } })
  const message = `400: ${JSON.stringify({ message: 'unknown provider for model example-model', type: 'invalid_request_error' })}`
  const source = http(400, 'Bad Request', { code: 'INVALID_REQUEST', message }, { detail: { ...http(400, 'Bad Request').detail, body, bodyState: 'complete' } })
  await withClipboard(async (copied) => {
    await renderRow('turn-error', terminal(message, 'INVALID_REQUEST'), { openDetails: false, response: details([source]), interact: async ({ row, toggle, click, beforeDisclosure }) => {
      assert.equal(beforeDisclosure.calls.length, 1)
      assert.equal(withClass(row.tree, 'bt_network')[0].type, 'section')
      assert.match(row.visible, /插件捕获的底层报错.*HTTP 400 Bad Request · unknown provider for model example-model/)
      assert.ok(!row.visible.includes(message))
      assert.ok(!row.visible.includes('gateway.example'))
      assert.ok(!row.visible.includes(body))
      assert.doesNotMatch(row.visible, /摘要 ·|查看完整原文|网络诊断详情/)
      assert.match(row.visible, /底层原始详情|一键复制排障报告/)
      assert.equal(withClass(row.tree, 'bt_fullOriginal').length, 0)
      const raw = await toggle(withClass(row.tree, 'bt_disclosure')[0], true)
      assert.ok(raw.visible.includes(`[INVALID_REQUEST] ${message}`))
      await click(elements(raw.tree, 'button').find((node) => text(node) === '复制完整错误'))
      const network = await toggle(withClass(raw.tree, 'bt_networkDetails')[0], true)
      assert.ok(network.visible.includes(body))
      assert.ok(network.visible.includes('gateway.example'))
    } })
    assert.deepEqual(copied, [`[INVALID_REQUEST] ${message}`])
  })
})

test('short native errors stay folded and copy completely without a summary duplicate', async () => {
  await withClipboard(async (copied) => {
    await renderRow('turn-error', terminal(), { openDetails: false, response: details([socket()]), interact: async ({ row, click, toggle }) => {
      assert.equal(withClass(row.tree, 'bt_original').length, 1)
      assert.equal(withClass(row.tree, 'bt_fullOriginal').length, 0)
      assert.doesNotMatch(row.visible, /\[TRANSPORT\] Connection error\./)
      assert.match(row.visible, /插件捕获的底层报错.*ECONNRESET/)
      assert.doesNotMatch(row.visible, /socket wrapper|gateway\.example/)
      const next = await toggle(withClass(row.tree, 'bt_disclosure')[0], true)
      assert.equal(next.visible.split('[TRANSPORT] Connection error.').length - 1, 1)
      await click(elements(next.tree, 'button').find((node) => text(node) === '复制完整错误'))
    } })
    assert.deepEqual(copied, ['[TRANSPORT] Connection error.'])
  })
})

test('capture preview stays bounded and marks partial or protected response state without decoding incomplete JSON', async () => {
  for (const state of ['pending', 'truncated', 'unreadable']) {
    const source = http(400, 'Bad Request', failure)
    source.detail = { ...source.detail, body: '{"error":{"message":"' + '😀'.repeat(180), bodyState: state }
    const row = await renderRow('turn-error', terminal(), { response: details([source]) })
    const preview = text(withClass(row.tree, 'bt_primary')[0])
    assert.ok(Array.from(preview).length <= 121)
    assert.ok(preview.includes('{"error"'), 'incomplete JSON remains literal rather than fabricated provider text')
    assert.ok(!preview.includes('\uFFFD'))
    assert.match(row.visible, /响应正文(?:读取中|已截断|读取失败)/)
  }
  const source = http(401, 'Unauthorized', failure)
  source.detail = { ...source.detail, body: 'WITHHELD_BODY', bodyReason: 'credential-protection', protected: true }
  const row = await renderRow('turn-error', terminal(), { response: details([source]) })
  assert.doesNotMatch(text(withClass(row.tree, 'bt_primary')[0]), /WITHHELD_BODY/)
  assert.match(row.visible, /认证响应正文已受保护/)
})

test('default capture copy is complete raw capture while native copy stays exact and report reuses one mounted read', async () => {
  await withClipboard(async (copied) => {
    const capture = http(503, 'Service Unavailable', failure)
    capture.detail.body = JSON.stringify({ error: { message: 'captured provider message\nsecond line', opaque: 'RAW_BODY_TAIL' } })
    await renderRow('turn-error', terminal(), { openDetails: false, response: reportPayload([capture]), interact: async ({ row, click, toggle }) => {
      assert.equal(row.calls.length, 1)
      const captureButton = elements(row.tree, 'button').find((node) => text(node) === '复制截获错误')
      assert.ok(withClass(row.tree, 'bt_copy', true).includes(captureButton), 'capture copy is available without native expansion')
      const expectedCapture = text(withClass(withClass(row.tree, 'bt_networkDetails')[0], 'bt_raw')[0])
      await click(captureButton)
      assert.equal(copied[0], expectedCapture, 'capture copy uses complete raw capture, not bounded preview')
      for (const value of ['HTTP 503 Service Unavailable', 'gateway.example/v1/chat/completions', 'x-request-id: request-debug-id', 'RAW_BODY_TAIL', 'elapsedMs=765432']) assert.ok(copied[0].includes(value), value)
      const reportButton = withClass(row.tree, 'bt_reportCopy', true)[0]
      assert.equal(text(reportButton), '一键复制排障报告')
      const report = await click(reportButton)
      assert.equal(report.calls.length, 1, 'one-click report reuses already fetched evidence')
      assert.match(copied[1], /DSH 原生报错: \[TRANSPORT\] Connection error\./)
      const native = await toggle(withClass(report.tree, 'bt_disclosure')[0], true)
      await click(elements(native.tree, 'button').find((node) => text(node) === '复制完整错误'))
      assert.equal(copied[2], '[TRANSPORT] Connection error.')
      assert.equal(native.calls.length, 1)
    } })
  })
})

test('retry default report and capture copy stay inside their own attempt with no duplicate latest controls', async () => {
  const first = { ...retry('first native', 'TRANSPORT').node.data.current, seq: 20, retry: 1, attemptId: 'first' }
  const second = { ...retry('second native', 'SERVER').node.data.current, seq: 30, retry: 2, attemptId: 'second' }
  const a = socket({ failure: first.failure, attemptId: 'first', context: { sessionId: 'session-client-test', provider: 'test-provider', attemptId: 'first' } })
  const b = http(503, 'Second capture', second.failure, { attemptId: 'second', context: { sessionId: 'session-client-test', provider: 'test-provider', attemptId: 'second' } })
  await withClipboard(async (copied) => {
    await renderRow('model-retry', { ...retry(), node: { data: { attempts: [first, second], current: second } } }, { openDetails: false, response: reportPayload([a, b]), interact: async ({ row, click, toggle }) => {
      const attempts = withClass(row.tree, 'bt_attempt').toSorted((a, b) => a.props.key - b.props.key)
      assert.equal(attempts.length, 2)
      assert.equal(withClass(row.tree, 'bt_reportCopy', true).length, 1)
      assert.equal(withClass(row.tree, 'bt_network', true).length, 1)
      assert.equal(withClass(row.tree, 'bt_disclosure').length, 0)
      row = await toggle(withClass(row.tree, 'bt_earlierErrors')[0], true)
      row = await toggle(withClass(row.tree, 'bt_earlierError')[0], true)
      assert.match(row.visible, /ECONNRESET/)
      for (let index = 0; index < attempts.length; index++) {
        assert.equal(withClass(attempts[index], 'bt_reportCopy', true).length, 1)
        assert.equal(withClass(attempts[index], 'bt_attemptNative')[0].props.open, false)
        await click(withClass(attempts[index], 'bt_reportCopy', true)[0])
      }
      assert.match(copied[0], /first native|ECONNRESET/)
      assert.doesNotMatch(copied[0], /second native|Second capture/)
      assert.match(copied[1], /second native|HTTP 503/)
      assert.doesNotMatch(copied[1], /first native|ECONNRESET/)
      assert.equal(row.calls.length, 1)
    } })
  })
})

test('consecutive error nodes fold older blocks lazily and reset when a newer error arrives', async () => {
  const node = { key: 'first', kind: 'turn-error', visibility: 'visible', data: terminal().node.data }
  const later = { key: 'second', kind: 'turn-error', visibility: 'visible', data: terminal('later failure').node.data }
  const tail = { key: 'tail', kind: 'turn-tail', visibility: 'visible', data: {} }
  let ordered = [node, tail, later]
  const useChat = (selector) => selector({ order: ordered.map((entry) => entry.key), nodes: { get: (key) => ordered.find((entry) => entry.key === key) } })
  await renderRow('turn-error', { ...terminal(), node, useChat }, { openDetails: false, response: details([socket()]), interact: async ({ row, toggle, update }) => {
    assert.equal(row.calls.length, 0, 'folded older node does not fetch capture until revealed')
    assert.match(row.visible, /更早的报错/)
    assert.doesNotMatch(row.visible, /ECONNRESET|一键复制排障报告/)
    let next = await toggle(withClass(row.tree, 'bt_earlierNode')[0], true)
    assert.equal(next.calls.length, 1)
    assert.match(next.visible, /ECONNRESET/)
    ordered = [node, { ...later, key: 'third' }]
    next = await update({ ...terminal(), node, useChat })
    assert.equal(withClass(next.tree, 'bt_earlierNode')[0].props.open, false, 'new successor resets old manual expansion')
    assert.doesNotMatch(next.visible, /ECONNRESET/)
    ordered = [node, { key: 'answer', kind: 'assistant-step', visibility: 'visible', data: {} }, later]
    next = await update({ ...terminal(), node, useChat })
    assert.equal(withClass(next.tree, 'bt_earlierNode').length, 1, 'an intervening reply does not remove historical folding')
    assert.match(next.visible, /ECONNRESET/, 'manual expansion survives while the newest error identity is unchanged')
  } })
  for (const boundary of [
    { key: 'user', kind: 'user', visibility: 'visible' },
    { key: 'tool', kind: 'tool-call', visibility: 'visible' },
    { key: 'success', kind: 'manual-compaction', visibility: 'visible', data: { compaction: {} } },
    { key: 'missing' },
  ]) {
    const useBoundary = (selector) => selector({ order: [node.key, boundary.key, later.key], nodes: { get: (key) => key === boundary.key ? boundary.kind ? boundary : undefined : key === node.key ? node : later } })
    const separated = await renderRow('turn-error', { ...terminal(), node, useChat: useBoundary }, { openDetails: false })
    assert.equal(withClass(separated.tree, 'bt_earlierNode').length, boundary.kind ? 1 : 0, boundary.key)
  }
  ordered = [node, later]
  const latest = await renderRow('turn-error', { ...terminal('later failure'), node: later, useChat }, { openDetails: false })
  assert.equal(withClass(latest.tree, 'bt_earlierNode').length, 0)
  assert.equal(latest.calls.length, 1, 'latest error keeps normal capture behavior')
})

test('earlier retries fold by stable record identity while newest record stays visible', async () => {
  const attempts = [1, 2, 3].map((retryNumber) => ({ ...retry('native-' + retryNumber).node.data.current, seq: retryNumber * 10, retry: retryNumber, attemptId: 'a' + retryNumber }))
  const captures = attempts.map((attempt, index) => http(503, 'capture-' + (index + 1), attempt.failure, { attemptId: attempt.attemptId, context: { sessionId: 'session-client-test', provider: 'test-provider', attemptId: attempt.attemptId } }))
  const props = { ...retry(), node: { data: { attempts, current: attempts.at(-1) } } }
  await renderRow('model-retry', props, { openDetails: false, response: details(captures), interact: async ({ row, toggle, update }) => {
    assert.match(row.visible, /capture-3/)
    assert.doesNotMatch(row.visible, /capture-1|capture-2/)
    assert.match(row.visible, /更早的报错 · 2/)
    let next = await toggle(withClass(row.tree, 'bt_earlierErrors')[0], true)
    assert.doesNotMatch(next.visible, /capture-1|capture-2/)
    next = await toggle(withClass(next.tree, 'bt_earlierError')[0], true)
    assert.match(next.visible, /capture-1/)
    assert.doesNotMatch(next.visible, /capture-2/)
    const current = { ...attempts.at(-1), seq: 40, retry: 4, attemptId: 'a4' }
    next = await update({ ...props, node: { data: { attempts: [...attempts, current], current } } })
    assert.equal(withClass(next.tree, 'bt_earlierErrors')[0].props.open, false)
    assert.doesNotMatch(next.visible, /capture-1|capture-2|capture-3/)
    assert.equal(withClass(next.tree, 'bt_attempt').filter((block) => block.type === 'div').length, 4, 'no errors are discarded or deduplicated')
  } })
})

test('report reads complete enabled-plugin environment on every click without cached inventory or private fields', async () => {
  const names = Array.from({ length: 125 }, (_, index) => ({ name: 'enabled-plugin-' + index, version: '1.2.' + index }))
  await withClipboard(async (copied) => {
    await renderRow('turn-error', terminal(), { openDetails: false, response: reportPayload(), environmentRespond: async (_options, count) => jsonResult({ runtime: {
      dshVersion: '0.2.2-rc.2', pluginVersion: '0.12.0', pluginsStatus: 'complete',
      enabledPlugins: [...names, names[0], { name: 'new-plugin', version: count === 1 ? '1.0.0' : '2.0.0', config: 'PRIVATE_CONFIG', path: 'PRIVATE_PATH', source: 'PRIVATE_SOURCE' }],
    } }), interact: async ({ row, click }) => {
      assert.equal(row.environmentCalls.length, 0, 'no inventory request before manual report generation')
      let next = await click(withClass(row.tree, 'bt_reportCopy')[0])
      assert.equal(next.environmentCalls.length, 1)
      const line = copied[0].split('\n').find((line) => line.startsWith('已启用第三方插件: '))
      for (const plugin of names) assert.ok(line.includes(plugin.name + '@' + plugin.version))
      assert.equal(line.split('enabled-plugin-0@').length - 1, 1)
      assert.match(line, /new-plugin@1\.0\.0/)
      assert.doesNotMatch(copied[0], /PRIVATE_CONFIG|PRIVATE_PATH|PRIVATE_SOURCE/)
      next = await click(withClass(next.tree, 'bt_reportCopy')[0])
      assert.equal(next.environmentCalls.length, 2, 'inventory is not reused from cached evidence')
      assert.match(copied[1], /new-plugin@2\.0\.0/)
      assert.doesNotMatch(copied[1], /new-plugin@1\.0\.0/)
      assert.equal(next.calls.length, 1, 'network evidence still reuses its completed cache')
    } })
  })
})

test('unavailable or partial plugin inventory remains explicit rather than claiming an empty list', async () => {
  for (const [environmentRespond, marker] of [
    [async () => { throw Error('SECRET_ENV_ERROR') }, '清单读取失败或不可用'],
    [async () => jsonResult({ runtime: { enabledPlugins: [{ name: 'known-plugin', version: null }], pluginsStatus: 'partial' } }), '部分插件信息未能确认'],
    [async () => jsonResult({ runtime: { enabledPlugins: [], pluginsStatus: 'complete' } }), '已启用第三方插件: 无'],
  ]) await withClipboard(async (copied) => {
    await renderRow('turn-error', terminal(), { openDetails: false, response: reportPayload(), environmentRespond, interact: async ({ row, click }) => {
      await click(withClass(row.tree, 'bt_reportCopy')[0])
      assert.ok(copied[0].includes(marker))
      assert.doesNotMatch(copied[0], /SECRET_ENV_ERROR/)
    } })
  })
})

test('changing identity aborts inventory read and cannot copy old report', async () => {
  const pending = deferred()
  await withClipboard(async (copied) => {
    await renderRow('turn-error', terminal(), { openDetails: false, response: reportPayload(), environmentRespond: () => pending.promise, interact: async ({ row, update, settle }) => {
      const task = withClass(row.tree, 'bt_reportCopy')[0].props.onClick()
      let next = await settle()
      assert.equal(next.environmentCalls.length, 1)
      next = await update({ ...terminal(), sessionId: 'new-report-session' })
      assert.equal(next.environmentCalls[0].options.signal.aborted, true)
      pending.resolve(jsonResult({ runtime: { enabledPlugins: [{ name: 'OLD_ENV', version: '1' }], pluginsStatus: 'complete' } }))
      await task
      assert.equal(copied.length, 0)
    } })
  })
})

test('only five inline renderers and the automatic-compaction definition are registered', () => {
  assert.deepEqual([...client.module.inject].sort(), ['locale', 'slots', 'uiConversation'])
  assert.deepEqual(client.slots.map((entry) => entry.options.key).sort(), ['better-tips-compaction', 'compaction', 'manual-compaction', 'model-retry', 'turn-error'])
  assert.ok(client.slots.every((entry) => entry.options.name === 'conversation.chat.node' && entry.options.priority === -100))
  assert.ok(client.injectionKeys.every((key) => key === 'conversation.chat.node'))
  assert.equal(client.slots.some((entry) => entry.options.name.includes('turnTail')), false)
  assert.deepEqual(client.definitions.map((definition) => definition.kind), ['better-tips-compaction'])
  assert.equal(client.definitions.some((definition) => definition.kind === 'better-tips'), false)
  assert.equal(client.locale.namespace, 'better-tips')
  assert.equal(client.t('ui.unconfirmed'), '关联未确认')
  for (const key of ['ui.loading', 'ui.empty', 'ui.loadFailed']) {
    assert.equal(typeof client.locale.dictionaries.zh[key], 'string')
    assert.equal(typeof client.locale.dictionaries.en[key], 'string')
  }
})

test('unloading restores shipped cells without same-priority collisions', () => {
  const mounted = mountFactory()
  mounted.dispose()
  assert.equal(mounted.occupied.size, 4)
  assert.ok([...mounted.occupied.values()].every((entry) => entry.shipped))
})

test('default capture preserves deepest code while complete evidence and native original stay independently folded', async () => {
  const row = await renderRow('turn-error', terminal(), { openDetails: false, response: details([socket()]) })
  assert.match(row.primary, /ECONNRESET.*read ECONNRESET/)
  assert.doesNotMatch(row.primary, /Connection error\.|TRANSPORT|fetch failed|socket wrapper/)
  assertQuiet(row.primary)
  for (const value of ['Connection error.', 'TRANSPORT', 'fetch failed', 'socket wrapper', 'ECONNRESET', '10.0.0.1', '443', 'gateway.example', '/v1/chat/completions']) assert.ok(row.full.includes(value), `raw details lost ${value}`)
  assert.equal(row.beforeDisclosure.calls.length, 1)
  assert.ok(elements(row.beforeDisclosure.tree, 'details').every((node) => !node.props.open))
  assert.match(row.calls[0].url, /^api\/better-tips\/details\?/)
})

test('native multiline original is not excerpted and opens in one native disclosure', async () => {
  const original = 'Connection error.\nprovider diagnostic: keep this line'
  const capture = socket({ failure: { code: 'TRANSPORT', message: original } })
  for (const response of [details([]), details([capture])]) {
    await renderRow('turn-error', terminal(original), { openDetails: false, response, interact: async ({ row, toggle }) => {
      assertOriginal(row, { code: 'TRANSPORT', message: original })
      assert.equal(withClass(row.tree, 'bt_preview').length, 0)
      assert.doesNotMatch(row.visible, /provider diagnostic|摘要 ·/)
      const next = await toggle(withClass(row.tree, 'bt_disclosure')[0], true)
      assert.ok(next.visible.includes(original))
      assert.equal(next.calls.length, 1)
    } })
  }
})

test('HTTP status/statusText is primary; headers, body, endpoint and timing are detail-only', async () => {
  const raw = { message: '504 status code (no body)', code: 'SERVER' }
  const row = await renderRow('turn-error', terminal(raw.message, raw.code), { response: details([http(504, 'Gateway Timeout', raw)]) })
  assert.match(text(withClass(row.tree, 'bt_primary')[0]), /HTTP\s*504.*Gateway Timeout/)
  assert.match(row.primary, /Gateway Timeout/)
  assertQuiet(row.primary)
  for (const value of ['Caddy', 'request-debug-id', 'raw-response-504', 'provider detail', 'gateway.example', '/v1/chat/completions', raw.message]) assert.ok(row.full.includes(value), `HTTP evidence lost ${value}`)
  assert.match(row.primary, /raw-response-504/); assert.doesNotMatch(row.primary, /provider detail/)
})

test('auth fallback preserves raw provider code/message and adds separate category advice without guessing quota', async () => {
  const raw = '401 {"error":{"message":"invalid account scope: model unavailable"}}'
  const row = await renderRow('turn-error', terminal(raw, 'AUTH'))
  assertOriginal(row, { code: 'AUTH', message: raw })
  assertMainAdvice(row, '检查凭据、账号状态及模型访问权限。')
  assert.doesNotMatch(row.primary, /API 密钥无效|额度已用尽|余额|推测/)
  assert.ok(row.full.includes(raw))
})

test('exact matching includes step and original failure, never a neighboring attempt', async () => {
  const a = { message: '504 status code (no body)', code: 'SERVER' }
  const b = { message: '431 headers too large', code: 'PI_AI_ERROR' }
  const response = details([http(504, 'Gateway Timeout', a), http(431, 'Request Header Fields Too Large', b)])
  const first = await renderRow('model-retry', retry(a.message, a.code), { response })
  assert.match(text(withClass(first.tree, 'bt_primary')), /HTTP\s*504/)
  assert.doesNotMatch(text(withClass(first.tree, 'bt_primary')), /431/)
  const second = await renderRow('model-retry', retry(b.message, b.code), { response })
  assert.match(text(withClass(second.tree, 'bt_primary')), /HTTP\s*431/)
  assert.doesNotMatch(text(withClass(second.tree, 'bt_primary')), /504/)
  const other = await renderRow('turn-error', terminal(), { response: details([socket({ step: 8 })]) })
  assert.match(other.primary, /未取得额外网络诊断/)
  assert.doesNotMatch(other.primary, /ECONNRESET/)
})

test('exact failure matching includes the raw code, not merely identical message text', async () => {
  const message = 'same wrapper message'
  const source = (code, native) => socket({ failure: { code, message }, detail: { ...socket().detail, error: { message: 'wrapper', cause: { code: native, message: `native ${native}` } } } })
  const response = details([source('SERVER', 'WRONG_NATIVE'), source('TRANSPORT', 'RIGHT_NATIVE')])
  const row = await renderRow('turn-error', terminal(message, 'TRANSPORT'), { response })
  assert.match(text(withClass(row.tree, 'bt_primary')), /RIGHT_NATIVE/)
  assert.doesNotMatch(text(withClass(row.tree, 'bt_primary')), /WRONG_NATIVE|关联未确认/)
})

test('broken SSE preserves its deepest native cause primary and stream metadata in details', async () => {
  const capture = socket()
  capture.detail = { ...capture.detail, kind: 'stream', status: 200, bytes: 54321 }
  const row = await renderRow('turn-error', terminal(), { response: details([capture]) })
  assert.match(text(withClass(row.tree, 'bt_primary')), /ECONNRESET/)
  assert.match(row.primary, /ECONNRESET/)
  assert.doesNotMatch(row.primary, /54321|fetch failed|socket wrapper|Connection error\./)
  assertQuiet(row.primary)
  assert.match(row.full, /54321/)
  assert.match(row.full, /fetch failed/)
})

test('no explanatory speculation or recorder counters survive anywhere in the inline evidence', async () => {
  const row = await renderRow('turn-error', terminal(), { response: details([socket()]) })
  assert.doesNotMatch(row.full, /推测|按错误码.*归类|捕获器|进程内失败|本轮命中|只有这一条捕获|例如我们|可能是同一次/)
})

test('one non-exact capture has only the short unconfirmed marker, never speculation', async () => {
  const row = await renderRow('model-retry', retry(), { response: details([http(499, 'Client Closed Request')]) })
  assert.match(row.full, /HTTP\s*499/)
  assert.match(row.full, /关联未确认/)
  assert.match(row.primary, /HTTP\s*499.*关联未确认|关联未确认.*HTTP\s*499/)
  assertQuiet(row.primary)
  assert.doesNotMatch(row.full, /可能是同一次|例如我们|只有这一条捕获|与本行的.*不同|无法证实/)
  assert.match(row.full, /Connection error\./)
  assert.match(row.full, /raw-response-499/)
})

test('multiple unmatched captures stay candidates in details; raw row failure stays primary', async () => {
  const row = await renderRow('model-retry', retry(), { response: details([http(499, 'Client Closed Request'), http(431, 'Request Header Fields Too Large')]) })
  assert.doesNotMatch(row.primary, /Connection error\.|TRANSPORT|HTTP\s*(499|431)/)
  assert.match(row.primary, /候选捕获/)
  assert.match(row.full, /499/)
  assert.match(row.full, /431/)
  assert.match(row.full, /候选|另一次|candidate/i)
  assert.ok(elements(row.tree, 'details').length > 0)
})

test('loading, empty capture and API failure never displace the primary error', async () => {
  for (const { key, options } of [
    { key: 'ui.loading', options: { pending: true } },
    { key: 'ui.empty', options: {} },
    { key: 'ui.loadFailed', options: { status: 401 } },
    { key: 'ui.loadFailed', options: { error: new Error('offline-test-marker') } },
  ]) {
    const row = await renderRow('turn-error', terminal(), options)
    assert.doesNotMatch(row.primary, /Connection error\.|TRANSPORT/)
    assertOriginal(row, failure)
    const marker = client.t(key, { message: '', error: '' }).replace(/\{[^{}]+\}/g, '').trim()
    assert.ok(row.full.includes(marker), `${key} should be available in details`)
    assert.equal(row.primary.includes(marker), true, `${key} is honestly visible without fabricated capture`)
    if (options.status) assert.match(row.full, /HTTP\s*401/)
    if (options.error) assert.match(row.full, /offline-test-marker/)
  }
})

test('retry summary includes state/count/delay and the same native primary', async () => {
  for (const state of ['scheduled', 'started', 'cancelled']) {
    const row = await renderRow('model-retry', retry(failure.message, failure.code, 3, state), { response: details([socket()]) })
    assert.match(row.primary, /重试/)
    assert.match(row.primary, /2\s*\/\s*5/)
    assert.match(row.primary, /987\s*(?:ms|毫秒)|0\.987\s*s/)
    assert.match(row.primary, /ECONNRESET/)
    assert.doesNotMatch(row.primary, /Connection error\.|TRANSPORT/)
    assertOriginal(row, failure)
    assertMainAdvice(row, '检查代理与上游连接')
    assertQuiet(row.primary)
  }
})

const compactFailureRecord = {
  id: 'compact-record', provider: 'provider-debug', model: 'model-debug', startedAt: 1000, endedAt: 4000,
  durationMs: 765432, status: 'error', delays: [987],
  attempts: [{ index: 1, at: 1000, failure, detail: socket().detail }, { index: 2, at: 3000, failure, detail: socket().detail }],
}
const compactions = (records = [compactFailureRecord]) => ({ records, capture: { installed: true, records: 78 } })
const manualFailure = {
  sessionId: 'session-client-compact-manual',
  node: { data: { command: { name: 'compact', commandId: 'cmd-1', seq: 1, time: 1000, args: null, outcome: { kind: 'error', text: 'Compaction could not produce a useful summary.' } }, compaction: null } },
}
const autoFailure = {
  sessionId: 'session-client-compact-auto',
  node: { data: { compactionId: 'compact-1', startedAt: 1000, endedAt: 4000, endSeq: 8, error: 'summarization produced no text summary content' } },
}

test('manual/auto compaction failures use the same native primary; metadata stays expanded', async () => {
  for (const [key, props] of [['manual-compaction', manualFailure], ['better-tips-compaction', autoFailure]]) {
    const row = await renderRow(key, props, { response: compactions() })
    assert.match(row.primary, /压缩|compact/i)
    assert.match(row.primary, /ECONNRESET|read ECONNRESET/)
    assert.match(row.full, /ECONNRESET|read ECONNRESET/)
    assert.equal(withClass(row.tree, 'bt_compactionHistory').length, 1)
    assert.equal(withClass(row.tree, 'bt_attempt').length, 2)
    assert.doesNotMatch(row.primary, /provider-debug|model-debug|次尝试|等待|重试/)
    const original = key === 'manual-compaction' ? manualFailure.node.data.command.outcome.text : autoFailure.node.data.error
    assert.ok(!row.primary.includes(original), 'native compaction error stays in its disclosure')
    assertOriginal(row, { message: original })
    assertMainAdvice(row, '展开错误详情，核对请求地址与服务端日志。')
    assertCaptureAdvice(row, '检查代理与上游连接')
    assertQuiet(row.primary)
    for (const value of ['provider-debug', 'model-debug', 'Connection error.', 'fetch failed', 'socket wrapper', 'gateway.example']) assert.ok(row.full.includes(value), `${key} details lost ${value}`)
    assert.ok(elements(row.tree, 'details').length > 0)
    assert.match(row.calls[0].url, /^api\/better-tips\/compaction\?/)
  }
})

test('manual compaction replaces generic notice with exact durable transaction failure in display copy and report', async () => {
  const concrete = 'summary is not smaller than the shadowed content (900 estimated framed tokens >= 800)'
  const source = sessionFixture([
    logEvent(1, 'command/run', { commandId: 'cmd-1', name: 'compact' }),
    logEvent(2, 'compaction/start', { sourceCommandId: 'cmd-1', compactionId: 'compact-exact' }),
    logEvent(3, 'compaction/end', { sourceCommandId: 'cmd-OTHER', compactionId: 'other', error: 'FOREIGN_ERROR' }),
    logEvent(4, 'compaction/end', { sourceCommandId: 'cmd-1', compactionId: 'compact-exact', error: concrete }),
    logEvent(5, 'command/done', { commandId: 'cmd-1', kind: 'error', text: manualFailure.node.data.command.outcome.text }),
  ])
  await withClipboard(async (copied) => {
    await renderRow('manual-compaction', manualFailure, { openDetails: false, sessions: source.service, response: { ...compactions([]), runtime: reportPayload().runtime }, interact: async ({ row, click }) => {
      assert.ok(row.visible.includes(concrete))
      assert.ok(!row.visible.includes(manualFailure.node.data.command.outcome.text))
      assert.doesNotMatch(row.full, /FOREIGN_ERROR/)
      await click(elements(row.tree, 'button').find((node) => text(node) === '复制完整错误'))
      await click(withClass(row.tree, 'bt_reportCopy')[0])
      assert.equal(copied[0], concrete)
      assert.ok(copied[1].includes(concrete))
      assert.ok(!copied[1].includes(manualFailure.node.data.command.outcome.text))
    } })
  })
  assert.equal(source.observers.size, 0)
  assert.equal(source.stats.subscriptions, source.stats.cleanups)
})

test('manual compaction rejects ambiguous transient and foreign transactions and updates on exact arrival', async () => {
  const event = (seq, id, error) => logEvent(seq, 'compaction/end', { sourceCommandId: 'cmd-1', compactionId: id, error })
  for (const events of [
    [event(3, 'a', 'AMBIGUOUS_A'), event(4, 'b', 'AMBIGUOUS_B')],
    [{ type: 'transient', event: event(3, 'a', 'TRANSIENT_ERROR') }],
    [logEvent(3, 'compaction/end', { sourceCommandId: 'cmd-other', compactionId: 'a', error: 'FOREIGN_ERROR' })],
  ]) {
    const source = sessionFixture(events)
    const row = await renderRow('manual-compaction', manualFailure, { openDetails: false, sessions: source.service, response: compactions([]) })
    assert.ok(row.visible.includes(manualFailure.node.data.command.outcome.text))
    assert.match(row.visible, /具体失败记录尚未加载/)
    assert.doesNotMatch(row.full, /AMBIGUOUS_|TRANSIENT_ERROR|FOREIGN_ERROR/)
  }
  const source = sessionFixture([])
  await renderRow('manual-compaction', manualFailure, { openDetails: false, sessions: source.service, response: compactions([]), interact: async ({ row, settle, update }) => {
    source.publish([event(4, 'exact', 'summarization produced no text summary content')])
    let next = await settle()
    assert.match(next.visible, /summarization produced no text summary content/)
    const changed = structuredClone(manualFailure)
    changed.sessionId = 'session-new'
    changed.node.data.command.commandId = 'cmd-new'
    next = await update(changed)
    assert.doesNotMatch(next.full, /summarization produced no text summary content/)
    source.publish([event(4, 'exact', 'OLD_IDENTITY_LEAK')])
    next = await settle()
    assert.doesNotMatch(next.full, /OLD_IDENTITY_LEAK/)
  } })
  assert.equal(source.observers.size, 0)
})

test('loaded compaction failure survives pagination error and summary failure remains separate from native notice', async () => {
  const concrete = 'summarization produced no text summary content'
  const event = logEvent(4, 'compaction/end', { sourceCommandId: 'cmd-1', compactionId: 'exact', error: concrete })
  const row = await renderRow('manual-compaction', manualFailure, { openDetails: false,
    sessions: sessionFixture([event], { loadError: Error('fixture pagination failed') }).service, response: compactions([]) })
  assert.ok(row.visible.includes(concrete))
  const record = { ...compactFailureRecord, attempts: [{ failure: { code: 'TRANSPORT', message: 'Stream ended without finish_reason' } }] }
  await withClipboard(async (copied) => {
    await renderRow('manual-compaction', manualFailure, { openDetails: false, response: { ...compactions([record]), runtime: reportPayload().runtime }, interact: async ({ row, click }) => {
      assert.match(row.visible, /摘要请求报错 · 关联未确认.*Stream ended without finish_reason/)
      assert.ok(row.visible.includes(manualFailure.node.data.command.outcome.text), 'separate native command notice remains honest')
      await click(withClass(row.tree, 'bt_reportCopy')[0])
      assert.match(copied[0], /摘要请求报错: \[TRANSPORT\] Stream ended without finish_reason/)
    } })
  })
})

test('manual durable failure hides AUTH and filters common credentials without changing source event', async () => {
  for (const message of ['AUTH: ARBITRARY_PRIVATE_ERROR', 'unrecognized-auth-value', 'provider failure sk-credentialSecret123456789']) {
    const event = logEvent(4, 'compaction/end', { sourceCommandId: 'cmd-1', compactionId: 'exact', error: message })
    const row = await renderRow('manual-compaction', manualFailure, { openDetails: false, sessions: sessionFixture([event]).service, response: compactions([]) })
    assert.doesNotMatch(row.full, /ARBITRARY_PRIVATE_ERROR|unrecognized-auth-value|credentialSecret123456789/)
    assert.equal(event.data.error, message)
  }
})

test('automatic durable compaction text is protected in fallback, report, target log and neighbor log', async () => {
  for (const message of ['AUTH: ARBITRARY_AUTO_AUTH_VALUE', 'unrecognized-auto-credential-value', 'provider failure sk-credentialSecret123456789']) {
    const props = { ...autoFailure, node: { data: { ...autoFailure.node.data, error: message } } }
    const event = logEvent(8, 'compaction/end', { compactionId: 'compact-1', error: message })
    const source = sessionFixture([event, logEvent(9, 'turn/end', { turn: 9, step: 3, error: failure })])
    await withClipboard(async (copied) => {
      const row = await renderRow('better-tips-compaction', props, { response: compactions([]), sessions: source.service, clickLog: true, interact: async ({ row, click }) => {
        assert.doesNotMatch(row.full, /ARBITRARY_AUTO_AUTH_VALUE|unrecognized-auto-credential-value|credentialSecret123456789/)
        assert.match(row.full, /正文已隐藏|认证错误正文已隐藏/)
        assert.match(text(withClass(row.tree, 'bt_logJson')[0]), /compaction diagnostic hidden/)
        await click(withClass(row.tree, 'bt_reportCopy')[0])
        assert.doesNotMatch(copied[0], /ARBITRARY_AUTO_AUTH_VALUE|unrecognized-auto-credential-value|credentialSecret123456789/)
      } })
      assert.equal(event.data.error, message, 'durable event is never changed')
      assert.ok(row.full.includes('compaction diagnostic hidden'))
    })
    const neighboring = await renderRow('turn-error', terminalLog(9), { sessions: source.service, clickLog: true })
    assert.doesNotMatch(neighboring.full, /ARBITRARY_AUTO_AUTH_VALUE|unrecognized-auto-credential-value|credentialSecret123456789/)
  }
})

test('compaction selects final max-tokens or incomplete attempt without reviving an earlier network failure', async () => {
  for (const [status, finishReason] of [['max-tokens', 'max-tokens'], ['incomplete', 'unexpected-kind']]) {
    const earlier = { index: 1, attemptId: 'older-summary', finishReason: 'error', failure: { code: 'SERVER', message: 'EARLIER_SUMMARY_FAILURE' }, detail: http(502, 'EARLIER_CAPTURE').detail }
    const latest = { index: 2, attemptId: 'latest-summary', finishReason }
    const record = { ...compactFailureRecord, status, attempts: [earlier, latest] }
    await withClipboard(async (copied) => {
      await renderRow('manual-compaction', manualFailure, { openDetails: false, response: compactions([record]), interact: async ({ row, click, toggle }) => {
        assert.doesNotMatch(row.visible, /EARLIER_SUMMARY_FAILURE|EARLIER_CAPTURE|HTTP 502/)
        assert.ok(row.visible.includes('finish=' + finishReason))
        assert.equal(withClass(row.tree, 'bt_nativeFallback').length, 1)
        await click(withClass(row.tree, 'bt_reportCopy')[0])
        assert.doesNotMatch(copied[0], /EARLIER_SUMMARY_FAILURE|EARLIER_CAPTURE|HTTP 502/)
        assert.ok(copied[0].includes('finish=' + finishReason))
        assert.match(copied[0], /未取得唯一匹配的底层证据/)
        const expanded = await toggle(withClass(row.tree, 'bt_disclosure')[0], true)
        assert.ok(expanded.full.includes('EARLIER_SUMMARY_FAILURE'), 'earlier evidence remains in history')
        assert.ok(expanded.full.includes('EARLIER_CAPTURE'))
        assert.doesNotMatch(expanded.visible, /EARLIER_SUMMARY_FAILURE|EARLIER_CAPTURE|HTTP 502/)
      } })
    })
  }
})

test('compaction without capture falls back to raw error, with evidence status only in details', async () => {
  const auto = await renderRow('better-tips-compaction', { ...autoFailure, node: { data: { ...autoFailure.node.data, error: 'summarization truncated at the token cap (incomplete checkpoint)' } } }, { response: compactions([]) })
  assert.match(auto.primary, /未取得额外网络诊断/)
  assert.match(auto.primary, /MAX_TOKENS/)
  assert.equal(withClass(auto.tree, 'bt_nativeFallback').length, 1)
  assert.equal(withClass(auto.tree, 'bt_network', true).length, 0)
  assertOriginal(auto, { code: 'MAX_TOKENS', message: 'summarization truncated at the token cap (incomplete checkpoint)' })
  assertMainAdvice(auto, '摘要输出 token 上限')
  assertQuiet(auto.primary)
  const manual = await renderRow('manual-compaction', manualFailure, { response: compactions([]) })
  assert.match(manual.primary, /未取得额外网络诊断/)
  assert.ok(manual.primary.includes(manualFailure.node.data.command.outcome.text))
  assertOriginal(manual, { message: manualFailure.node.data.command.outcome.text })
  assertMainAdvice(manual, '展开错误详情，核对请求地址与服务端日志。')
  assertQuiet(manual.primary)
})

test('compaction native-only failures stay visible and source-labelled through missing capture states', async () => {
  for (const options of [
    { pending: true },
    { response: compactions([]) },
    { response: compactions([{ ...compactFailureRecord, attempts: [{ failure }] }]) },
    { response: { records: [], capture: { installed: false, reason: 'config-disabled' } } },
    { response: { records: [], capture: { installed: false, reason: 'unavailable' } } },
    { status: 503 },
  ]) {
    for (const [key, props, message] of [
      ['manual-compaction', manualFailure, manualFailure.node.data.command.outcome.text],
      ['better-tips-compaction', autoFailure, autoFailure.node.data.error],
    ]) {
      const row = await renderRow(key, props, { ...options, openDetails: false })
      assert.ok(row.visible.includes(message))
      const native = withClass(row.tree, 'bt_nativeFallback')[0]
      assert.ok(native)
      assert.match(text(native), /DSH 原生报错/)
      assert.equal(withClass(row.tree, 'bt_original').filter((node) => text(node) === message).length, 1, 'native failure is not duplicated in the log disclosure')
      assert.equal(withClass(row.tree, 'bt_network', true).length, 0, 'native text never masquerades as plugin capture')
      assert.equal(withClass(row.tree, 'bt_reportCopy', true).length, 1)
    }
  }
  const waiting = deferred()
  await renderRow('better-tips-compaction', autoFailure, { openDetails: false, respond: () => waiting.promise, interact: async ({ row, settle }) => {
    assert.ok(row.visible.includes(autoFailure.node.data.error))
    waiting.resolve(jsonResult(compactions()))
    const ready = await settle()
    assert.equal(withClass(ready.tree, 'bt_nativeFallback').length, 0)
    assert.match(ready.visible, /插件捕获的底层报错.*ECONNRESET/)
    assert.ok(!ready.visible.includes(autoFailure.node.data.error), 'captured evidence replaces fallback, native source remains folded')
    assert.equal(ready.calls.length, 1)
  } })
})

test('successful manual/auto compaction preserves counts/summary; request metadata is expanded', async () => {
  const marker = { kind: 'compaction', seq: 44, time: 12100, summary: '## Preserved summary\nexact body\nnext line', shadowedItemCount: 12, shadowedTokenCount: 84000 }
  const record = { id: 'success', provider: 'provider-debug', model: 'model-debug', startedAt: 5000, endedAt: 12100, durationMs: 7100, status: 'ok', delays: [], attempts: [{ index: 1 }], usage: { inputTokens: 84000, outputTokens: 2200 } }
  for (const [key, props] of [
    ['compaction', { sessionId: 'session-client-success-a', node: { data: marker } }],
    ['manual-compaction', { sessionId: 'session-client-success-b', node: { data: { command: { name: 'compact', time: 5000, outcome: { kind: 'success' } }, compaction: marker } } }],
  ]) {
    const row = await renderRow(key, props, { response: compactions([record]) })
    assert.match(row.primary, /压缩|compact/i)
    assert.match(row.primary, /12/)
    assert.match(row.primary, /84[,.]?000|84k|84K|8\.4万/)
    assert.doesNotMatch(row.primary, /provider-debug|model-debug|7100|7\.1|2200|2\.2k/)
    assert.ok(row.full.includes(marker.summary), 'summary remains verbatim')
    assert.ok(row.full.includes('provider-debug'))
    assert.ok(row.full.includes('model-debug'))
    assert.equal(withClass(row.tree, 'bt_advice').length, 0, 'successful compaction has no main advice')
    assert.equal(withClass(row.tree, 'bt_captureAdvice').length, 0, 'successful compaction has no capture-specific advice')
    assert.doesNotMatch(row.primary, /排查/)
    assert.ok(elements(row.beforeDisclosure.tree, 'details').every((node) => !node.props.open))
  }
})

test('advice dictionaries have bilingual key and placeholder parity', () => {
  const { zh, en } = client.locale.dictionaries
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  for (const key of Object.keys(zh)) {
    assert.equal(typeof zh[key], 'string', `Chinese translation ${key}`)
    assert.equal(typeof en[key], 'string', `English translation ${key}`)
    assert.ok(zh[key].trim() && en[key].trim(), `nonempty translation ${key}`)
    assert.deepEqual((zh[key].match(/\{[^{}]+\}/g) ?? []).sort(), (en[key].match(/\{[^{}]+\}/g) ?? []).sort(), `translation placeholders ${key}`)
  }
  assert.ok(Object.values(zh).includes('排查'), 'advice label is localized')
})

test('confirmed deepest native codes select concise advice without changing original or native text', async () => {
  for (const [code, fragment] of [
    ['ECONNRESET', '检查代理与上游连接'],
    ['EPIPE', '检查代理与上游连接'],
    ['UND_ERR_SOCKET', '检查代理与上游连接'],
    ['ENOTFOUND', '核对 API 域名'],
    ['EAI_AGAIN', '检查 DNS'],
    ['UND_ERR_CONNECT_TIMEOUT', '检查目标地址、代理与防火墙'],
    ['UND_ERR_HEADERS_TIMEOUT', '响应头'],
    ['UND_ERR_BODY_TIMEOUT', '读取超时'],
    ['CERT_HAS_EXPIRED', '系统时间'],
    ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', '证书链'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', '证书域名'],
  ]) {
    const nativeMessage = `native diagnostic for ${code}\nsecond diagnostic line`
    const capture = socket()
    capture.detail.error = { name: 'TypeError', message: 'fetch failed', code: 'AUTH', cause: { name: 'Error', message: nativeMessage, code } }
    const row = await renderRow('turn-error', terminal(), { response: details([capture]) })
    assertOriginal(row, failure)
    assertMainAdvice(row, fragment)
    const native = withClass(row.tree, 'bt_primary')
    assert.equal(native.length, 1)
    assert.equal(text(native[0]), `[${code}] native diagnostic for ${code}…`, `${code} capture preview is a bounded first line`)
    assert.ok(row.full.includes(nativeMessage), 'complete native message remains verbatim in network details')
    assert.ok(row.full.includes('fetch failed'), 'outer cause remains in raw details')
  }
})

test('confirmed HTTP status selects advice while preserving the response headline', async () => {
  for (const [status, fragment] of [
    [401, 'API 密钥'], [403, '权限'], [429, 'Retry-After'],
    [499, '取消'], [431, '请求头'], [504, '网关'],
  ]) {
    const statusText = `status-text-${status}`
    const capture = http(status, statusText, failure)
    const row = await renderRow('turn-error', terminal(), { response: details([capture]) })
    assertOriginal(row, failure)
    assertMainAdvice(row, fragment)
    assert.equal(text(withClass(row.tree, 'bt_primary')[0]), `HTTP ${status} ${statusText} · raw-response-${status}…`)
    assert.ok(row.full.includes(capture.detail.body), 'response body remains unchanged in details')
  }
})

test('structured exact provider error.code or error.type takes precedence over HTTP status advice', async () => {
  for (const [code, fragment, excluded] of [
    ['context_length_exceeded', '压缩上下文', 'Retry-After'],
    ['insufficient_quota', '余额', 'Retry-After'],
  ]) {
    for (const field of ['code', 'type']) {
      const capture = http(429, 'Too Many Requests', failure)
      capture.detail.body = JSON.stringify({ error: { [field]: code, message: 'keep raw provider message' } })
      const row = await renderRow('turn-error', terminal(), { response: details([capture]) })
      assertOriginal(row, failure)
      const advice = assertMainAdvice(row, fragment)
      assert.ok(!advice.includes(excluded), `${field}=${code} overrides generic HTTP 429 advice`)
      assert.match(text(withClass(row.tree, 'bt_primary')), /HTTP 429 Too Many Requests/)
      assert.match(row.primary, /HTTP 429 Too Many Requests/)
      assert.ok(row.full.includes(capture.detail.body), 'structured JSON is preserved verbatim')
      assert.ok(!row.primary.includes(capture.detail.body), 'provider body stays collapsed')
    }
  }
})

test('free text, malformed JSON, message fields and nonexact codes never guess provider quota or context causes', async () => {
  for (const body of [
    'quota insufficient_quota context_length_exceeded',
    '{"error":{"code":"insufficient_quota"}',
    JSON.stringify({ error: { message: 'insufficient_quota context_length_exceeded quota' } }),
    JSON.stringify({ error: { code: 'insufficient_quota_extra', type: 'context_length_exceeded_extra' } }),
    JSON.stringify({ error: { code: 'INSUFFICIENT_QUOTA', type: 'CONTEXT_LENGTH_EXCEEDED' } }),
    JSON.stringify({ error: { code: { value: 'insufficient_quota' }, type: ['context_length_exceeded'] } }),
  ]) {
    const capture = http(429, 'Too Many Requests', failure)
    capture.detail.body = body
    const row = await renderRow('turn-error', terminal(), { response: details([capture]) })
    const advice = assertMainAdvice(row, 'Retry-After')
    assert.doesNotMatch(advice, /余额|压缩上下文/)
    assert.ok(row.full.includes(body), 'unrecognized body is still available unchanged')
    assertOriginal(row, failure)
  }
  const original = { code: 'UNKNOWN_TEST', message: 'prose says quota insufficient_quota ECONNRESET HTTP 401 context_length_exceeded' }
  const row = await renderRow('turn-error', terminal(original.message, original.code))
  assertOriginal(row, original)
  assertMainAdvice(row, '展开错误详情，核对请求地址与服务端日志。')
})

test('unconfirmed HTTP401 capture cannot change original TRANSPORT main advice', async () => {
  const baseline = await renderRow('turn-error', terminal())
  const expected = assertMainAdvice(baseline)
  for (const capture of [
    http(401, 'Unauthorized'),
    http(401, 'Unauthorized', failure, { approximate: true }),
  ]) {
    const row = await renderRow('turn-error', terminal(), { response: details([capture]) })
    assert.equal(assertMainAdvice(row), expected)
    assert.doesNotMatch(assertMainAdvice(row), /API 密钥/)
    assert.match(row.primary, /HTTP 401 Unauthorized|关联未确认/)
    assertCaptureAdvice(row, 'API 密钥')
    assertOriginal(row, failure)
  }
})

test('unmatched candidate advice is capture-specific and never replaces original-category main advice', async () => {
  const baseline = await renderRow('model-retry', retry())
  const row = await renderRow('model-retry', retry(), { response: details([http(401, 'Unauthorized'), http(431, 'Request Header Fields Too Large')]) })
  assert.equal(assertMainAdvice(row), assertMainAdvice(baseline))
  assert.doesNotMatch(row.primary, /API 密钥|请求头|HTTP 401|HTTP 431/)
  assertCaptureAdvice(row, 'API 密钥')
  assertCaptureAdvice(row, '请求头')
  assertOriginal(row, failure)
})

test('unknown original and unknown confirmed native codes use generic advice instead of prose guessing', async () => {
  const generic = '展开错误详情，核对请求地址与服务端日志。'
  const original = { code: 'UNKNOWN_TEST', message: 'unknown provider error\nkeep the second line' }
  const empty = await renderRow('turn-error', terminal(original.message, original.code))
  assertMainAdvice(empty, generic)
  assertOriginal(empty, original)
  const capture = socket({ failure: original })
  capture.detail.error = { code: 'UNKNOWN_NATIVE', message: 'quota DNS certificate expired ECONNRESET' }
  const confirmed = await renderRow('turn-error', terminal(original.message, original.code), { response: details([capture]) })
  assertMainAdvice(confirmed, generic)
  assertOriginal(confirmed, original)
  assert.equal(text(withClass(confirmed.tree, 'bt_primary')[0]), '[UNKNOWN_NATIVE] quota DNS certificate expired ECONNRESET')
})

test('common remaining network codes and DSH categories always add one separate advice without rewriting raw failures', async () => {
  for (const code of [
    'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT',
    'AUTH', 'TRANSPORT', 'TIMEOUT', 'RATE_LIMIT', 'SERVER', 'EMPTY_RESPONSE', 'PI_AI_ERROR', 'INTERRUPTED', 'ACCOUNT_SIGNED_OUT',
  ]) {
    const original = { code, message: `raw ${code} message\nkeep exact text` }
    const row = await renderRow('turn-error', terminal(original.message, code))
    assertOriginal(row, original)
    assertMainAdvice(row, code === 'AUTH' ? '检查凭据、账号状态及模型访问权限。' : undefined)
  }
})

test('loading or unavailable evidence does not remove original-only advice', async () => {
  const baseline = await renderRow('turn-error', terminal())
  for (const options of [{ pending: true }, { status: 401 }, { error: new Error('offline') }]) {
    const row = await renderRow('turn-error', terminal(), options)
    assert.equal(assertMainAdvice(row), assertMainAdvice(baseline))
    assertOriginal(row, failure)
    assert.doesNotMatch(row.primary, /API 密钥/)
  }
})

const logMissing = '未找到对应原始事件；未跳转到其他记录。'
const eventEntry = (event) => ({ type: 'event', event })
const logEvent = (seq, type, data = {}) => ({ seq, type, time: 1793520000000 + seq, data })
function sessionFixture (initial = [], { load, bindingError, snapshotError, loadError } = {}) {
  let entries = initial.map((event) => event?.type === 'event' || event?.type === 'transient' ? event : eventEntry(event))
  const observers = new Set()
  const stats = { bindings: [], reads: 0, subscriptions: 0, cleanups: 0, loads: [] }
  const publish = (next) => {
    entries = next.map((event) => event?.type === 'event' || event?.type === 'transient' ? event : eventEntry(event))
    for (const callback of [...observers]) callback()
  }
  const binding = {
    eventSource: {
      getSnapshot () { stats.reads++; if (snapshotError) throw snapshotError; return { entries } },
      subscribe (callback) { stats.subscriptions++; observers.add(callback); return () => { if (observers.delete(callback)) stats.cleanups++ } },
    },
    session: {
      async loadThrough (seq) {
        stats.loads.push(seq)
        if (loadError) throw loadError
        if (load) await load({ seq, publish, entries })
      },
    },
  }
  return {
    stats, publish, observers,
    service: { binding (sessionId) { stats.bindings.push(sessionId); if (bindingError) throw bindingError; return binding } },
  }
}
function terminalLog (seq, overrides = {}) {
  const props = terminal()
  props.node = { ...props.node, anchorSeq: seq, ...overrides, data: { ...props.node.data, seq, ...overrides.data } }
  return props
}
function assertLogTarget (row, event, sessionId = 'session-client-') {
  assert.equal(withClass(row.tree, 'bt_logPanel').length, 1, 'one inline log panel is open')
  const target = withClass(row.tree, 'bt_logTarget')
  assert.equal(target.length, 1, 'exactly one event is the original target')
  assert.equal(Number(target[0].props['data-seq']), event.seq)
  const json = withClass(target[0], 'bt_logJson')
  assert.equal(json.length, 1, 'the target contains its raw event JSON')
  assert.equal(text(json[0]), JSON.stringify(event, null, 2), 'raw event JSON is exact, not a UI reconstruction')
  assert.match(row.full, /会话原始日志/)
  assert.ok(row.full.includes(sessionId), 'panel identifies the session')
}

test('raw log opener is lazy and does not bind, read or subscribe before click', async () => {
  const event = logEvent(80, 'turn/end', { turn: 9, step: 3, error: failure })
  const source = sessionFixture([event])
  const row = await renderRow('turn-error', terminalLog(80), { sessions: source.service })
  assert.equal(source.stats.bindings.length, 0)
  assert.equal(source.stats.reads, 0)
  assert.equal(source.stats.subscriptions, 0)
  assert.equal(source.stats.loads.length, 0)
  assert.equal(withClass(row.tree, 'bt_logPanel').length, 0)
  const button = withClass(row.tree, 'bt_logButton')
  assert.equal(button.length, 1)
  assert.match(text(button[0]), /打开日志/)
  assertOriginal(row, failure)
  assertMainAdvice(row)
})

test('raw turn log opens without a network capture, preserves exact JSON and cleans its subscription', async () => {
  const event = logEvent(80, 'turn/end', { turn: 9, step: 3, error: failure, arbitrary: { preserve: ['all', 'fields'] } })
  const source = sessionFixture([logEvent(79, 'assistant/message', { text: 'earlier' }), event, logEvent(81, 'turn/start', { turn: 10 })])
  const row = await renderRow('turn-error', terminalLog(80), { sessions: source.service, clickLog: true })
  assertLogTarget(row, event)
  assert.deepEqual(source.stats.bindings, ['session-client-test'])
  assert.ok(source.stats.loads.includes(80))
  assert.ok(source.stats.subscriptions > 0)
  assert.equal(source.stats.cleanups, source.stats.subscriptions)
  assert.equal(source.observers.size, 0)
  assert.equal(row.calls.filter((call) => !call.url.includes('/log-metadata?')).length, row.beforeOpen.calls.length, 'opening logs does not fetch a new memory capture')
  assertOriginal(row, failure)
  assert.equal(assertMainAdvice(row), assertMainAdvice(row.beforeOpen), 'opening logs does not alter advice')
})

test('turn log may use anchorSeq but rejects a wrong event type or turn at that exact sequence', async () => {
  const event = logEvent(80, 'turn/end', { turn: 9, step: 3, error: failure })
  const props = terminalLog(80)
  delete props.node.data.seq
  const good = await renderRow('turn-error', props, { sessions: sessionFixture([event]).service, clickLog: true })
  assertLogTarget(good, event)
  for (const wrong of [logEvent(80, 'llm/retry', { turn: 9 }), logEvent(80, 'turn/end', { turn: 8 })]) {
    const row = await renderRow('turn-error', props, { sessions: sessionFixture([wrong, logEvent(81, 'turn/end', { turn: 9, error: failure })]).service, clickLog: true })
    assert.match(row.full, new RegExp(logMissing))
    assert.equal(withClass(row.tree, 'bt_logTarget').length, 0, 'never substitutes a neighboring event')
  }
})

test('retry log uses the current retry sequence, never the first-attempt anchorSeq', async () => {
  const props = retry()
  props.node.anchorSeq = 40
  Object.assign(props.node.data.current, { seq: 75, retryId: 'retry-shared' })
  const first = logEvent(40, 'llm/retry', { turn: 9, step: 3, retryId: 'retry-shared', retry: 1, failure })
  const current = logEvent(75, 'llm/retry', { turn: 9, step: 3, retryId: 'retry-shared', retry: 2, failure })
  const source = sessionFixture([first, current])
  const row = await renderRow('model-retry', props, { sessions: source.service, clickLog: true })
  assertLogTarget(row, current)
  assert.deepEqual(source.stats.loads, [75])
  assertOriginal(row, failure)
  for (const field of ['retryId', 'retry', 'turn', 'step']) {
    const wrong = { ...current, data: { ...current.data, [field]: field === 'retryId' ? 'other-retry' : current.data[field] + 1 } }
    const rejected = await renderRow('model-retry', props, { sessions: sessionFixture([first, wrong]).service, clickLog: true })
    assert.ok(rejected.full.includes(logMissing), `reject mismatched ${field}`)
    assert.equal(withClass(rejected.tree, 'bt_logTarget').length, 0)
  }
})

test('missing raw-log coordinates disable the opener instead of falling back to anchor or message text', async () => {
  const retryProps = retry()
  retryProps.node.anchorSeq = 40
  const source = sessionFixture([logEvent(40, 'llm/retry', { turn: 9, step: 3, retry: 2, failure })])
  for (const [key, props] of [['model-retry', retryProps], ['turn-error', terminal()]]) {
    const row = await renderRow(key, props, { sessions: source.service })
    const button = withClass(row.tree, 'bt_logButton')
    assert.equal(button.length, 1)
    assert.equal(button[0].props.disabled, true)
    assert.equal(withClass(row.tree, 'bt_logPanel').length, 0)
  }
  assert.equal(source.stats.bindings.length, 0)
})

test('automatic compaction log uses endSeq and validates the exact compaction identity', async () => {
  const props = { ...autoFailure, node: { ...autoFailure.node, anchorSeq: 11, data: { ...autoFailure.node.data, endSeq: 22 } } }
  const event = logEvent(22, 'compaction/end', { compactionId: 'compact-1', error: 'summarization produced no text summary content' })
  const source = sessionFixture([logEvent(11, 'compaction/start', { compactionId: 'compact-1' }), event])
  const row = await renderRow('better-tips-compaction', props, { sessions: source.service, clickLog: true })
  assertLogTarget(row, event)
  assert.deepEqual(source.stats.loads, [22])
  const fallbackProps = { ...props, node: { ...props.node, anchorSeq: 22, data: { ...props.node.data } } }
  delete fallbackProps.node.data.endSeq
  const fallback = await renderRow('better-tips-compaction', fallbackProps, { sessions: source.service, clickLog: true })
  assertLogTarget(fallback, event)
  for (const wrong of [logEvent(22, 'compaction/start', event.data), logEvent(22, 'compaction/end', { ...event.data, compactionId: 'other' })]) {
    const rejected = await renderRow('better-tips-compaction', props, { sessions: sessionFixture([wrong]).service, clickLog: true })
    assert.ok(rejected.full.includes(logMissing))
    assert.equal(withClass(rejected.tree, 'bt_logTarget').length, 0)
  }
})

test('manual compaction selects its unique command/done, not command/run or another command', async () => {
  const run = logEvent(1, 'command/run', { commandId: 'cmd-1', name: 'compact' })
  const done = logEvent(8, 'command/done', { commandId: 'cmd-1', outcome: { kind: 'error', text: manualFailure.node.data.command.outcome.text } })
  const other = logEvent(9, 'command/done', { commandId: 'cmd-2', outcome: { kind: 'error', text: 'same message' } })
  const source = sessionFixture([run, done, other])
  const row = await renderRow('manual-compaction', manualFailure, { sessions: source.service, clickLog: true })
  assertLogTarget(row, done)
  assert.deepEqual(source.stats.loads, [1, 1])
  for (const events of [[run], [run, other], [run, done, { ...done, seq: 10 }]]) {
    const rejected = await renderRow('manual-compaction', manualFailure, { sessions: sessionFixture(events).service, clickLog: true })
    assert.ok(rejected.full.includes(logMissing), 'absent or ambiguous done events remain unresolved')
    assert.equal(withClass(rejected.tree, 'bt_logTarget').length, 0)
  }
})

test('loadThrough and live event-source updates can provide a target after opening; transient entries are ignored', async () => {
  const event = logEvent(80, 'turn/end', { turn: 9, step: 3, error: failure })
  const transient = { type: 'transient', event: { ...event, data: { ...event.data, marker: 'never durable' } } }
  const source = sessionFixture([transient], { load: async ({ seq, publish }) => { assert.equal(seq, 80); publish([transient, event]) } })
  const row = await renderRow('turn-error', terminalLog(80), { sessions: source.service, clickLog: true,
    interact: async ({ row, settle }) => {
      assertLogTarget(row, event)
      assert.equal(source.observers.size, 1)
      source.publish([transient, event, logEvent(81, 'turn/start', { turn: 10 })])
      assertLogTarget(await settle(), event)
    },
  })
  assertLogTarget(row, event)
  assert.equal(source.observers.size, 0)
  const transientOnly = await renderRow('turn-error', terminalLog(80), { sessions: sessionFixture([transient]).service, clickLog: true })
  assert.ok(transientOnly.full.includes(logMissing))
  assert.equal(withClass(transientOnly.tree, 'bt_logTarget').length, 0)
})

test('absent session service and binding/read/load errors leave the original row usable', async () => {
  for (const options of [
    {},
    { sessions: sessionFixture([], { bindingError: new Error('binding-failed-test') }).service },
    { sessions: sessionFixture([], { snapshotError: new Error('snapshot-failed-test') }).service },
    { sessions: sessionFixture([], { loadError: new Error('load-failed-test') }).service },
  ]) {
    const row = await renderRow('turn-error', terminalLog(80), { ...options, clickLog: true })
    assert.equal(withClass(row.tree, 'bt_logPanel').length, 1)
    assert.equal(withClass(row.tree, 'bt_logTarget').length, 0)
    assert.ok(!row.full.includes(logMissing), 'service failures are not silently reported as missing events')
    assertOriginal(row, failure)
    assertMainAdvice(row)
    assert.equal(withClass(row.beforeOpen.tree, 'bt_logPanel').length, 0)
  }
})

test('opened raw log displays physical path and verified source reference separately from the event', async () => {
  const event = logEvent(80, 'turn/end', { turn: 9, reason: { kind: 'error', error: failure } })
  const metadata = { log: { status: 'found', path: 'D:\\logs\\session.v4.jsonl.zstd', seq: 80 }, sources: [{ role: 'producer', function: 'stream', path: 'D:\\runtime\\openai-completions.js', line: 485 }] }
  const row = await renderRow('turn-error', terminalLog(80), { response: metadata, sessions: sessionFixture([event]).service, clickLog: true })
  assert.match(row.full, /源码匹配（非调用堆栈）/)
  assert.ok(row.full.includes(metadata.log.path))
  assert.ok(row.full.includes('D:\\runtime\\openai-completions.js:485'))
  assert.ok(row.calls.some((call) => call.url.includes('log-metadata?sessionId=session-client-test&seq=80')))
  assert.equal(row.beforeOpen.calls.some((call) => call.url.includes('/log-metadata?')), false)
  assertLogTarget(row, event)
})

test('raw log neighboring events remain context and do not replace the exact target', async () => {
  const event = logEvent(80, 'turn/end', { turn: 9, step: 3, error: failure })
  const events = Array.from({ length: 9 }, (_, i) => i === 4 ? event : logEvent(76 + i, 'assistant/message', { text: `neighbor-${76 + i}` }))
  const row = await renderRow('turn-error', terminalLog(80), { sessions: sessionFixture(events).service, clickLog: true,
    interact: async ({ row, click }) => {
      assertLogTarget(row, event)
      const neighbors = elements(row.tree, 'button').filter((button) => button.props['data-log-seq'] !== undefined && Number(button.props['data-log-seq']) !== 80)
      assert.ok(neighbors.length <= 6, 'at most three durable neighbors on each side')
      if (neighbors.length) assertLogTarget(await click(neighbors[0]), event)
    },
  })
  assertLogTarget(row, event)
})

test('no additional diagnosis, disabled capture and unavailable capture use distinct honest states', async () => {
  for (const [capture, expected] of [
    [{ installed: true }, '未取得额外网络诊断'],
    [{ installed: false, reason: 'config-disabled' }, '额外网络诊断已关闭'],
    [{ installed: false, reason: 'install-failed' }, '额外网络诊断不可用'],
  ]) {
    const row = await renderRow('turn-error', terminal(), { response: { items: [], capture } })
    assert.ok(row.full.includes(expected))
    assert.doesNotMatch(row.full, /无捕获记录/)
    assertOriginal(row, failure)
    assert.ok(withClass(row.tree, 'bt_refresh').length)
  }
})

test('exact missing finish_reason message gets protocol advice before TRANSPORT or captured network category', async () => {
  const message = 'Stream ended without finish_reason'
  const raw = { code: 'TRANSPORT', message }
  for (const response of [details([]), details([socket({ failure: raw })])]) {
    const row = await renderRow('turn-error', terminal(message), { response })
    const advice = assertMainAdvice(row, 'finish_reason')
    assert.match(advice, /接口兼容性|上游提前结束/)
    assert.doesNotMatch(advice, /TLS/)
    assertOriginal(row, raw)
  }
})

test('same-code/message attempts are candidates without identity; unique near time selects current evidence', async () => {
  const a = socket({ failureTime: 1000, failureIndex: 1, attemptId: 'a', context: { sessionId: 'session-client-test', provider: 'test-provider', attemptId: 'a' } })
  const b = socket({ failureTime: 2000, failureIndex: 2, attemptId: 'b', context: { sessionId: 'session-client-test', provider: 'test-provider', attemptId: 'b' }, detail: { ...socket().detail, error: { code: 'EPIPE', message: 'write EPIPE' } } })
  const ambiguous = await renderRow('model-retry', retry(), { response: details([a, b]) })
  assert.doesNotMatch(ambiguous.primary, /ECONNRESET|EPIPE/)
  assert.match(ambiguous.full, /候选捕获/)
  const props = retry()
  props.node.data.current.time = 2003
  const selected = await renderRow('model-retry', props, { response: details([a, b]) })
  assert.match(text(withClass(selected.tree, 'bt_primary')), /EPIPE/)
  assert.doesNotMatch(text(withClass(selected.tree, 'bt_primary')), /ECONNRESET/)
  assert.match(selected.full, /关联未确认/)
  assertMainAdvice(selected, '查看会话日志')
  const tie = await renderRow('model-retry', props, { response: details([{ ...a, failureTime: 2000 }, b]) })
  assert.doesNotMatch(tie.primary, /ECONNRESET|EPIPE/)
})

test('legacy evidence never confirms itself and foreign request context stays unconfirmed', async () => {
  for (const capture of [socket({ provenance: undefined }), socket({ context: { sessionId: 'other-session' } })]) {
    const row = await renderRow('turn-error', terminal(), { response: details([capture]) })
    assert.match(row.full, /关联未确认/)
    assert.match(row.primary, /关联未确认/)
    assert.doesNotMatch(assertMainAdvice(row), /检查代理与上游连接/)
  }
})

test('manual refresh replaces pending or empty response body without automatic repeated requests', async () => {
  for (const bodyState of ['pending', 'complete']) {
    const capture = http(429, 'Too Many Requests', failure)
    capture.detail.body = ''
    capture.detail.bodyState = bodyState
    let reads = 0
    const row = await renderRow('turn-error', terminal(), {
      respond: async () => ({ ok: true, json: async () => { reads++; return details([reads === 1 ? capture : { ...capture, detail: { ...capture.detail, body: '{"error":{"code":"insufficient_quota"}}', bodyState: 'complete' } }]) } }),
      interact: async ({ row, click }) => {
        assert.match(row.full, bodyState === 'pending' ? /响应正文读取中/ : /响应正文为空/)
        assert.equal(reads, 1)
        const next = await click(withClass(row.tree, 'bt_refresh')[0])
        assertMainAdvice(next, '余额')
      },
    })
    assert.equal(reads, 2)
    assertOriginal(row, failure)
    assert.ok(row.calls[0].options.signal.aborted, 'superseded request is aborted')
    assert.ok(row.calls[1].options.signal.aborted, 'unmounted request is aborted')
  }
})

test('evidence timeout is recoverable and aborts the pending fetch', async () => {
  const callbacks = new Map()
  let nextId = 0
  const row = await renderRow('turn-error', terminal(), { pending: true,
    timers: { set: (fn) => { callbacks.set(++nextId, fn); return nextId }, clear: (id) => callbacks.delete(id) },
    interact: async ({ row, settle }) => {
      assert.equal(callbacks.size, 1)
      callbacks.values().next().value()
      const next = await settle()
      assert.match(next.full, /Request timeout/)
      assert.ok(withClass(next.tree, 'bt_refresh').length)
      assertOriginal(next, failure)
    },
  })
  assert.equal(row.calls[0].options.signal.aborted, true)
  assert.equal(callbacks.size, 0)
})

test('copy actions copy only the selected error, coordinates or real path with visible feedback', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const copied = []
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { async writeText (value) { copied.push(value) } } } })
  try {
    await renderRow('turn-error', terminal(), { interact: async ({ row, click }) => {
      const button = elements(row.tree, 'button').find((node) => text(node) === '复制完整错误')
      const next = await click(button)
      assert.match(next.full, /已复制/)
      assertOriginal(next, failure)
    } })
    assert.deepEqual(copied, ['[TRANSPORT] Connection error.'])
    copied.length = 0
    const event = logEvent(80, 'turn/end', { turn: 9, reason: { kind: 'error', error: failure } })
    const path = 'D:\\logs\\real-session.jsonl.zstd'
    await renderRow('turn-error', terminalLog(80), { sessions: sessionFixture([event]).service, clickLog: true,
      response: { log: { status: 'found', path }, sources: [] },
      interact: async ({ row, click }) => {
        await click(elements(row.tree, 'button').find((node) => text(node) === '复制日志坐标'))
        await click(elements(row.tree, 'button').find((node) => text(node) === '复制路径'))
      },
    })
    assert.deepEqual(copied, ['session-client-test · seq=80', path])
    globalThis.navigator.clipboard.writeText = async () => { throw new Error('denied') }
    await renderRow('turn-error', terminal(), { interact: async ({ row, click }) => {
      const next = await click(elements(row.tree, 'button').find((node) => text(node) === '复制完整错误'))
      assert.match(next.full, /复制失败，请手动选择文本/)
      assertOriginal(next, failure)
    } })
  } finally {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous)
    else delete globalThis.navigator
  }
})

test('metadata and source references precede full raw JSON and refresh independently', async () => {
  const event = logEvent(80, 'turn/end', { turn: 9, reason: { kind: 'error', error: failure } })
  let metadataReads = 0
  const row = await renderRow('turn-error', terminalLog(80), { sessions: sessionFixture([event]).service, clickLog: true,
    respond: async (url) => url.includes('/log-metadata?') ? (++metadataReads === 1
      ? { ok: false, status: 503 }
      : { ok: true, json: async () => ({ log: { status: 'found', path: 'D:\\logs\\retry.jsonl' }, sources: [] }) })
      : { ok: true, json: async () => details([]) },
    interact: async ({ row, click }) => {
      assert.match(row.full, /路径与源码信息读取失败/)
      assertLogTarget(row, event)
      const logPanel = withClass(row.tree, 'bt_logPanel')[0]
      const refreshed = await click(withClass(logPanel, 'bt_refresh')[0])
      assertLogTarget(refreshed, event)
      assert.ok(refreshed.full.indexOf('D:\\logs\\retry.jsonl') < refreshed.full.indexOf(JSON.stringify(event, null, 2)))
    },
  })
  assert.equal(metadataReads, 2)
  assertOriginal(row, failure)
})

test('automatic definition ignores manual/unrelated events and emits only failed end rows', () => {
  const definition = client.definitions[0]
  const start = { type: 'compaction/start', seq: 40, time: 100, data: { compactionId: 'c1', turn: 2 } }
  const done = { type: 'compaction/end', seq: 42, time: 200, data: { compactionId: 'c1', turn: 2, error: 'Connection error.' } }
  const startMatch = definition.match(start)
  const endMatch = definition.match(done)
  assert.equal(endMatch?.id, 'c1')
  assert.ok(['start', 'update'].includes(endMatch?.role))
  assert.equal(definition.match({ ...start, data: { ...start.data, sourceCommandId: 'cmd-1' } }), null)
  assert.equal(definition.match({ ...done, data: { ...done.data, sourceCommandId: 'cmd-1' } }), null)
  assert.equal(definition.match({ type: 'turn/start', data: { turn: 2 } }), null)
  assert.equal(definition.match({ type: 'llm/retry', data: { turn: 2 } }), null)
  const contextFor = (event, state) => ({ key: 'context-key', id: 'c1', start: { event, location: { kind: 'turn', turn: { turn: 2 } } }, matches: [{ event }], state })
  let node
  if (startMatch !== null) {
    assert.deepEqual(startMatch, { id: 'c1', role: 'start' })
    const state = definition.start({}, { event: start })
    const context = contextFor(start, state)
    assert.equal(definition.buildViewNode(context), null)
    const success = definition.update({ state }, { event: { ...done, data: { compactionId: 'c1', turn: 2 } } })
    assert.equal(definition.buildViewNode({ ...context, state: success }), null)
    const failed = definition.update({ state }, { event: done })
    node = definition.buildViewNode({ ...context, state: failed })
  } else {
    assert.equal(definition.match({ ...done, data: { compactionId: 'c1', turn: 2 } }), null)
    assert.equal(endMatch.role, 'start')
    const state = definition.start({}, { event: done })
    node = definition.buildViewNode(contextFor(done, state))
  }
  assert.equal(node.key, 'context-key')
  assert.equal(node.kind, 'better-tips-compaction')
  assert.equal(node.target, 'chat')
  assert.equal(node.visibility, 'visible')
  assert.equal(node.groupTree, 'turn')
  assert.equal(node.anchorSeq, done.seq)
  assert.ok(JSON.stringify(node.data).includes('Connection error.'))
})

test('protected AUTH projection is explained without recovering provider text', async () => {
  const props = terminal()
  Object.assign(props.node.data, { code: 'AUTH', message: '' })
  const row = await renderRow('turn-error', props)
  assertOriginal(row, { code: 'AUTH', message: '' })
  assert.match(row.primary, /认证错误正文已隐藏，避免回显凭据/)
  assert.equal(withClass(row.tree, 'bt_protected', true).length, 1)
  assert.equal(withClass(row.tree, 'bt_advice').length, 0)
})

test('scoped failure without captured detail shows empty state without repeating original', async () => {
  const row = await renderRow('turn-error', terminal(), { response: details([{ ...socket(), detail: undefined }]) })
  assertOriginal(row, failure)
  assert.match(row.full, /未取得额外网络诊断/)
  assert.equal(withClass(row.tree, 'bt_capture').length, 0)
})

test('selected capture does not repeat the visible raw failure', async () => {
  const row = await renderRow('turn-error', terminal(), { response: details([socket()]) })
  assertOriginal(row, failure)
  const captures = withClass(row.tree, 'bt_capture')
  assert.equal(captures.length, 1)
  assert.ok(!text(captures[0]).includes('[TRANSPORT] Connection error.'))
})

test('raw log display hides AUTH text and common credentials without modifying durable event', async () => {
  const raw = { code: 'AUTH', message: 'UnrecognizableCredentialEcho987654321' }
  const event = logEvent(80, 'turn/end', { turn: 9, reason: { kind: 'error', error: raw }, context: 'Bearer syntheticToken987654321' })
  const original = JSON.stringify(event)
  const props = terminalLog(80)
  Object.assign(props.node.data, { code: 'AUTH', message: '' })
  const row = await renderRow('turn-error', props, { sessions: sessionFixture([event]).service, clickLog: true })
  assert.ok(!row.full.includes(raw.message))
  assert.ok(!row.full.includes('syntheticToken987654321'))
  assert.match(row.full, /AUTH diagnostic hidden/)
  assert.match(row.full, /持久化原始日志未改写/)
  assert.equal(JSON.stringify(event), original)
})

test('AUTH body protection is not presented as an empty response', async () => {
  const row = await renderRow('turn-error', terminal(), { response: details([{ ...socket(), detail: { kind: 'response', status: 401, bodyState: 'skipped', bodyReason: 'credential-protection' } }]) })
  assert.match(row.full, /认证响应正文已受保护/)
  assert.ok(!row.full.includes('响应正文为空'))
})

test('failed rows request capture once on mount while successful compaction remains lazy', async () => {
  const marker = { time: 1500, summary: 'preserved summary', shadowedItemCount: 4, shadowedTokenCount: 800 }
  for (const [key, props, expectedReads] of [
    ['turn-error', terminal(), 1], ['model-retry', retry(), 1], ['manual-compaction', manualFailure, 1],
    ['better-tips-compaction', autoFailure, 1], ['compaction', { sessionId: 'session-summary', node: { data: marker } }, 0],
    ['manual-compaction', { sessionId: 'session-summary', node: { data: { command: {}, compaction: marker } } }, 0],
  ]) {
    const source = sessionFixture([])
    const row = await renderRow(key, props, { sessions: source.service, openDetails: false })
    assert.equal(row.calls.length, expectedReads, `${key} has exactly the intended initial read`)
    assert.equal(row.beforeDisclosure.calls.length, expectedReads)
    const manualError = key === 'manual-compaction' && props.node.data.command?.outcome?.kind === 'error'
    assert.equal(source.stats.reads, manualError ? 2 : 0)
    assert.equal(source.stats.bindings.length, manualError ? 1 : 0)
    assert.ok(elements(row.tree, 'details').every((node) => !node.props.open))
    assert.equal(text(row.tree, true), row.primary)
  }
})

test('long Unicode native original opens completely in one layer and copies unchanged', async () => {
  await withClipboard(async (copied) => {
    const message = '😀'.repeat(170) + '\nsecond line must survive copying'
    await renderRow('turn-error', terminal(message), { openDetails: false, interact: async ({ row, toggle, click }) => {
      assert.equal(withClass(row.tree, 'bt_preview').length, 0)
      assert.doesNotMatch(row.primary, /摘要 ·|second line|😀/)
      assert.equal(row.calls.length, 1)
      const expanded = await toggle(withClass(row.tree, 'bt_disclosure')[0], true)
      assertOriginal(expanded, { code: 'TRANSPORT', message })
      assert.ok(expanded.visible.includes(message))
      assert.ok(!expanded.visible.includes('\uFFFD'))
      assert.equal(withClass(expanded.tree, 'bt_fullOriginal').length, 0)
      await click(elements(expanded.tree, 'button').find((node) => text(node) === '复制完整错误'))
    } })
    assert.deepEqual(copied, [`[TRANSPORT] ${message}`])
  })
})

test('durable mixed retry records remain chronological even without volatile captures', async () => {
  const attempts = [
    { ...retry('first endpoint failed', 'TRANSPORT').node.data.current, seq: 41, retry: 1, retryId: 'chain', time: 1000 },
    { ...retry('429 insufficient_quota', 'QUOTA').node.data.current, seq: 52, retry: 2, retryId: 'chain', time: 2000 },
    { ...retry('first endpoint failed', 'TRANSPORT').node.data.current, seq: 63, retry: 3, retryId: 'chain', time: 3000 },
  ]
  const props = retry()
  props.node.data = { attempts, current: attempts.at(-1) }
  const row = await renderRow('model-retry', props, { response: details([]) })
  assert.match(row.primary, /更早的报错 · 2/)
  assert.doesNotMatch(row.primary, /重试记录 · 3|类别概览|本组包含不同错误/)
  assert.doesNotMatch(row.primary, /→|↔|⇒|->/)
  assert.doesNotMatch(row.primary, /first endpoint failed|429 insufficient_quota/)
  assert.match(assertMainAdvice(row), /查看会话日志/)
  assert.equal(withClass(row.tree, 'bt_history').length, 1)
  const records = withClass(row.tree, 'bt_attempt')
  assert.equal(records.length, 3, 'identical failures at distinct durable seqs must never deduplicate')
  assert.deepEqual(records.map((record) => record.props.key), [63, 41, 52])
  assert.deepEqual(records.toSorted((a, b) => a.props.key - b.props.key).map((record) => text(withClass(record, 'bt_original')[0])), attempts.map((attempt) => `[${attempt.failure.code}] ${attempt.failure.message}`))
  assert.ok(records.every((record) => record.type === 'div'))
  assert.ok(withClass(row.tree, 'bt_attemptNative').every((record) => !record.props.open), 'each native original stays independently folded')
  assert.match(row.visible, /未取得额外网络诊断/)
  assert.doesNotMatch(row.visible, /复制完整错误|first endpoint failed|429 insufficient_quota/)
  assert.equal(withClass(row.tree, 'bt_reportCopy', true).length, 1, 'only latest report is outside earlier-error disclosures')
  assert.equal(row.calls.length, 1, 'one outer history read, not one API per durable attempt')
})

test('every retry attempt opens its own exact durable log coordinate and same errors never share panels', async () => {
  const attempts = [20, 30, 40].map((seq, index) => ({ ...retry().node.data.current, seq, retry: index + 1, retryId: 'same-chain', time: seq }))
  const props = retry()
  props.node.anchorSeq = 20
  props.node.data = { attempts, current: attempts.at(-1) }
  const events = attempts.map((attempt) => logEvent(attempt.seq, 'llm/retry', { ...attempt }))
  const source = sessionFixture(events)
  await renderRow('model-retry', props, { sessions: source.service, response: details([]), interact: async ({ row, toggle, click }) => {
    assert.equal(source.stats.bindings.length, 0)
    for (let index = 0; index < attempts.length; index++) {
      const ownRecord = (tree) => withClass(tree, 'bt_attempt').find((record) => record.props.key === attempts[index].seq)
      let record = ownRecord(row.tree)
      let next = await toggle(withClass(record, 'bt_attemptNative')[0], true)
      record = ownRecord(next.tree)
      assert.ok(!withClass(record, 'bt_logPanel').length)
      next = await click(withClass(record, 'bt_logButton')[0])
      const panel = withClass(ownRecord(next.tree), 'bt_logTarget')[0]
      assert.equal(panel.props['data-seq'], attempts[index].seq)
      assert.equal(text(withClass(panel, 'bt_logJson')[0]), JSON.stringify(events[index], null, 2))
      assert.equal(withClass(next.tree, 'bt_logTarget').length, index + 1)
      row = next
    }
  } })
  assert.deepEqual(source.stats.loads, [20, 30, 40])
  assert.equal(source.stats.cleanups, 3)
  assert.equal(source.observers.size, 0)
})

test('mixed retry advice remains per-attempt with only exact matched native evidence', async () => {
  const a = { ...retry('a failure', 'TRANSPORT').node.data.current, seq: 20, retry: 1, time: 1001, attemptId: 'a' }
  const b = { ...retry('b failure', 'SERVER').node.data.current, seq: 30, retry: 2, time: 2001, attemptId: 'b' }
  const captureA = socket({ attemptId: 'a', context: { sessionId: 'session-client-test', provider: 'test-provider', attemptId: 'a' }, failure: a.failure, failureTime: 1000 })
  const captureB = http(429, 'Too Many Requests', b.failure, { attemptId: 'b', context: { sessionId: 'session-client-test', provider: 'test-provider', attemptId: 'b' }, failureTime: 2000 })
  const props = retry()
  props.node.data = { attempts: [a, b], current: b }
  const row = await renderRow('model-retry', props, { response: details([captureA, captureB]) })
  assert.match(assertMainAdvice(row), /Retry-After/)
  const records = withClass(row.tree, 'bt_attempt').toSorted((a, b) => a.props.key - b.props.key)
  assert.match(text(withClass(records[0], 'bt_primary')), /ECONNRESET/)
  assert.doesNotMatch(text(withClass(records[0], 'bt_primary')), /HTTP 429/)
  assert.match(text(withClass(records[1], 'bt_primary')), /HTTP 429/)
  assert.doesNotMatch(text(withClass(records[1], 'bt_primary')), /ECONNRESET/)
  assert.match(text(withClass(records[0], 'bt_captureAdvice')), /检查代理与上游连接/)
  assert.match(text(withClass(records[1], 'bt_captureAdvice')), /Retry-After/)
  assert.match(text(records[0], true), /检查代理与上游连接/)
  assert.match(text(records[1], true), /Retry-After/)
})

test('compaction latest capture defaults visible while historical originals remain independent', async () => {
  const record = { ...compactFailureRecord, attempts: [
    { index: 1, attemptId: 'ca', failure: { code: 'SERVER', message: '503 first\ncomplete first body' }, detail: http(503, 'Unavailable').detail },
    { index: 2, attemptId: 'cb', failure: { code: 'TRANSPORT', message: 'reset second\ncomplete second body' }, detail: socket().detail },
  ] }
  await renderRow('better-tips-compaction', autoFailure, { openDetails: false, response: compactions([record]), interact: async ({ row, toggle }) => {
    assert.match(row.visible, /ECONNRESET|关联未确认/)
    assert.doesNotMatch(row.visible, /complete first body|complete second body|HTTP 503/)
    let next = await toggle(withClass(row.tree, 'bt_disclosure')[0], true)
    assert.match(next.visible, /按时间关联 · 未确认请求身份/)
    const attempts = withClass(next.tree, 'bt_attempt')
    assert.equal(attempts.length, 2)
    assert.ok(attempts.every((node) => node.type === 'div'))
    assert.ok(withClass(next.tree, 'bt_attemptNative').every((node) => !node.props.open))
    assert.doesNotMatch(next.visible, /HTTP 503/)
    next = await toggle(withClass(next.tree, 'bt_earlierErrors')[0], true)
    next = await toggle(withClass(next.tree, 'bt_earlierError')[0], true)
    assert.match(next.visible, /HTTP 503/)
    next = await toggle(withClass(withClass(next.tree, 'bt_attempt')[0], 'bt_attemptNative')[0], true)
    assert.match(next.visible, /complete first body/)
    assert.doesNotMatch(next.visible, /complete second body/)
    assert.equal(withClass(next.tree, 'bt_network').length, 3, 'default latest capture plus two isolated history captures')
    assert.ok(next.full.includes('complete second body'))
  } })
})

test('closing native original leaves completed capture visible without extra fetch', async () => {
  await renderRow('turn-error', terminal(), { openDetails: false, response: details([socket()]), interact: async ({ row, toggle, settle }) => {
    assert.equal(row.calls.length, 1)
    const opened = await toggle(withClass(row.tree, 'bt_disclosure')[0], true)
    assert.match(opened.visible, /Connection error\./)
    const closed = await toggle(withClass(opened.tree, 'bt_disclosure')[0], false)
    assert.equal(closed.calls.length, 1)
    assert.equal(closed.calls[0].options.signal.aborted, false)
    assert.match(closed.visible, /ECONNRESET/)
    assert.doesNotMatch(closed.visible, /Connection error\.|fetch failed/)
    const reopened = await toggle(withClass(closed.tree, 'bt_disclosure')[0], true)
    assert.equal(reopened.calls.length, 1)
    assert.match(reopened.visible, /Connection error\./)
    assert.doesNotMatch(reopened.visible, /加载中/)
    assert.equal((await settle()).calls.length, 1, 'no polling after settling')
  } })
})

test('closing native original does not abort pending capture; refresh cancels stale capture and unmount drains', async () => {
  const first = deferred()
  const result = await renderRow('turn-error', terminal(), { openDetails: false,
    respond: (_url, _options, index) => index === 1 ? first.promise : Promise.resolve(jsonResult(details([http(503, 'Fresh evidence', failure)]))),
    interact: async ({ row, toggle, settle, click }) => {
      assert.equal(row.calls.length, 1)
      let next = await toggle(withClass(row.tree, 'bt_disclosure')[0], true)
      next = await toggle(withClass(next.tree, 'bt_disclosure')[0], false)
      assert.equal(next.calls[0].options.signal.aborted, false)
      assert.match(next.visible, /加载中/)
      next = await click(withClass(next.tree, 'bt_refresh')[0])
      assert.equal(next.calls.length, 2)
      assert.equal(next.calls[0].options.signal.aborted, true)
      assert.match(next.visible, /Fresh evidence/)
      first.resolve(jsonResult(details([http(401, 'STALE_CANCELLED', failure)])))
      next = await settle()
      assert.doesNotMatch(next.full, /STALE_CANCELLED/)
      next = await toggle(withClass(next.tree, 'bt_disclosure')[0], true)
      next = await toggle(withClass(next.tree, 'bt_disclosure')[0], false)
      assert.equal(next.calls.length, 2)
      assert.match(next.visible, /Fresh evidence/)
    },
  })
  assert.ok(result.calls.every((call) => call.options.signal.aborted), 'unmount cancels owned request scopes')
})

test('changing row identity rejects late old-session responses and never sends old log metadata coordinates', async () => {
  const old = deferred()
  const nextProps = { ...terminal('new failure'), sessionId: 'session-next', node: { data: { turn: 10, step: 3, code: 'TRANSPORT', message: 'new failure', seq: 90 } } }
  const event = logEvent(90, 'turn/end', { turn: 10, reason: { kind: 'error', error: { code: 'TRANSPORT', message: 'new failure' } } })
  const source = sessionFixture([event])
  await renderRow('turn-error', terminalLog(80), { openDetails: false, sessions: source.service,
    respond: (url) => url.includes('sessionId=session-client-test') ? old.promise : Promise.resolve(jsonResult(url.includes('/log-metadata?') ? { log: { status: 'found', path: 'D:\\logs\\new.jsonl' }, sources: [] } : details([socket({ failure: { code: 'TRANSPORT', message: 'new failure' }, context: { sessionId: 'session-next', provider: 'test-provider', attemptId: 'fixture-attempt' }, detail: { kind: 'response', status: 503, statusText: 'NEW_SESSION_EVIDENCE' } })]))),
    interact: async ({ row, toggle, update, settle, click }) => {
      let next = await toggle(withClass(row.tree, 'bt_disclosure')[0], true)
      assert.equal(next.calls.length, 1)
      next = await update(nextProps)
      assert.ok(next.calls[0].options.signal.aborted)
      assert.equal(next.calls.length, 2)
      assert.match(next.full, /NEW_SESSION_EVIDENCE/)
      old.resolve(jsonResult(details([socket({ detail: { kind: 'response', status: 401, statusText: 'OLD_SESSION_LEAK' } })])))
      next = await settle()
      assert.doesNotMatch(next.full, /OLD_SESSION_LEAK/)
      next = await click(withClass(next.tree, 'bt_logButton')[0])
      assertLogTarget(next, event, 'session-next')
      assert.deepEqual(source.stats.bindings, ['session-next'])
      assert.deepEqual(source.stats.loads, [90])
      const metadata = next.calls.filter((call) => call.url.includes('/log-metadata?'))
      assert.equal(metadata.length, 1)
      assert.match(metadata[0].url, /sessionId=session-next&seq=90/)
    },
  })
})

test('text visibility follows individual details.open and never exposes another folded attempt', () => {
  const tree = React.createElement('details', { open: true }, React.createElement('summary', null, 'outer'),
    React.createElement('details', { open: true }, React.createElement('summary', null, 'open attempt'), 'visible original'),
    React.createElement('details', { open: false }, React.createElement('summary', null, 'folded attempt'), 'hidden original'))
  assert.match(text(tree, true), /visible original/)
  assert.doesNotMatch(text(tree, true), /hidden original/)
  assert.equal(text(tree, 'collapsed'), 'outer')
  assert.match(text(tree), /hidden original/)
})

test('an already-open exact log panel is reset when the row coordinate identity changes', async () => {
  const first = logEvent(80, 'turn/end', { turn: 9, reason: { kind: 'error', error: failure }, marker: 'OLD_EVENT_MARKER' })
  const second = logEvent(91, 'turn/end', { turn: 10, reason: { kind: 'error', error: { code: 'SERVER', message: 'new durable failure' } }, marker: 'NEW_EVENT_MARKER' })
  const source = sessionFixture([first, second])
  const nextProps = terminalLog(91, { data: { turn: 10, code: 'SERVER', message: 'new durable failure' } })
  await renderRow('turn-error', terminalLog(80), { sessions: source.service, clickLog: true,
    interact: async ({ row, update, click }) => {
      assertLogTarget(row, first)
      const changed = await update(nextProps)
      assert.equal(withClass(changed.tree, 'bt_logTarget').length, 0, 'old panel is not rendered under the new coordinate')
      assert.equal(withClass(changed.tree, 'bt_logPanel').length, 0, 'new identity starts with its own closed log')
      assert.doesNotMatch(changed.full, /OLD_EVENT_MARKER/)
      const opened = await click(withClass(changed.tree, 'bt_logButton')[0])
      assertLogTarget(opened, second)
      assert.deepEqual(source.stats.loads, [80, 91])
      assert.equal(source.stats.subscriptions, 2)
      assert.equal(source.stats.cleanups, 1, 'old subscription is released immediately on identity replacement')
    },
  })
  assert.equal(source.observers.size, 0)
})

test('nested disclosure toggle events do not mutate the outer lazy disclosure', async () => {
  await renderRow('turn-error', terminal(), { openDetails: false, interact: async ({ row, settle, toggle }) => {
    const outer = withClass(row.tree, 'bt_disclosure')[0]
    outer.props.onToggle({ currentTarget: { open: true }, target: { nested: true } })
    let next = await settle()
    assert.equal(withClass(next.tree, 'bt_disclosure')[0].props.open, false)
    assert.equal(next.calls.length, 1)
    next = await toggle(withClass(next.tree, 'bt_disclosure')[0], true)
    assert.equal(next.calls.length, 1)
    const openOuter = withClass(next.tree, 'bt_disclosure')[0]
    openOuter.props.onToggle({ currentTarget: { open: false }, target: { nested: true } })
    next = await settle()
    assert.equal(withClass(next.tree, 'bt_disclosure')[0].props.open, true)
    assert.equal(next.calls.length, 1)
  } })
})

test('opening then closing before fetch microtask never starts an unnecessary request', async () => {
  await renderRow('turn-error', terminal(), { openDetails: false, interact: async ({ row, settle }) => {
    const outer = withClass(row.tree, 'bt_disclosure')[0]
    outer.props.onToggle({ currentTarget: { open: true } })
    outer.props.onToggle({ currentTarget: { open: false } })
    const next = await settle()
    assert.equal(next.calls.length, 1, 'native toggles do not restart the mount-time capture read')
    assert.equal(withClass(next.tree, 'bt_disclosure')[0].props.open, false)
  } })
})

test('structured long native JSON remains complete with no native excerpt and copies verbatim', async () => {
  await withClipboard(async (copied) => {
    const message = '503: ' + JSON.stringify({ error: { message: 'literal provider '.repeat(40) + '\nfull second diagnostic line', type: 'overloaded_error', extra: 'opaque evidence preserved' } })
    await renderRow('turn-error', terminal(message, 'SERVER'), { interact: async ({ row, click }) => {
      assert.equal(withClass(row.tree, 'bt_preview').length, 0)
      assert.doesNotMatch(row.primary, /opaque evidence|full second diagnostic|overloaded_error|摘要/)
      assertOriginal(row, { code: 'SERVER', message })
      assert.ok(row.visible.includes(message))
      await click(elements(row.tree, 'button').find((node) => text(node) === '复制完整错误'))
    } })
    assert.deepEqual(copied, ['[SERVER] ' + message])
  })
})

test('same HTTP status with different native codes remains distinct and structured status takes precedence', async () => {
  const attempts = [
    { ...retry('opaque rate failure', 'RATE_LIMIT').node.data.current, seq: 20, retry: 1, failure: { code: 'RATE_LIMIT', message: 'opaque rate failure', status: 429 } },
    { ...retry('opaque quota failure', 'QUOTA').node.data.current, seq: 30, retry: 2, failure: { code: 'QUOTA', message: 'opaque quota failure', status: 429 } },
  ]
  const props = retry()
  props.node.data = { attempts, current: attempts[1] }
  const row = await renderRow('model-retry', props, { openDetails: false })
  assert.match(row.primary, /更早的报错 · 1/)
  assert.match(assertMainAdvice(row), /账号余额、用量配额/)
  assertOriginal(row, attempts[0].failure)
  assertOriginal(row, attempts[1].failure)
  assert.equal(row.calls.length, 1)
  assert.equal(withClass(row.tree, 'bt_history').length, 1)
})

test('complete native JSON is never decoded or shortened in its single native disclosure', async () => {
  for (const body of [
    { error: { message: '真实供应商首行\n第二行必须保留', code: 'overloaded_error' } },
    { message: 'top-level literal message', code: 'arbitrary' },
  ]) {
    const message = `503: ${JSON.stringify(body)}`
    await renderRow('turn-error', terminal(message, 'SERVER'), { openDetails: false, interact: async ({ row, toggle }) => {
      assert.equal(withClass(row.tree, 'bt_preview').length, 0)
      assert.doesNotMatch(row.visible, /真实供应商首行|top-level literal message|摘要/)
      assertOriginal(row, { code: 'SERVER', message })
      const next = await toggle(withClass(row.tree, 'bt_disclosure')[0], true)
      assert.equal(text(withClass(next.tree, 'bt_original')[0]), '[SERVER] ' + message)
      assert.equal(withClass(next.tree, 'bt_fullOriginal').length, 0)
    } })
  }
  for (const message of ['503: {"error":{"message":"broken"}', '503: {"error":{"message":42}}', 'prefix 503: {"message":"not an exact wrapper"}']) {
    const row = await renderRow('turn-error', terminal(message, 'SERVER'), { openDetails: false })
    assert.equal(text(withClass(row.tree, 'bt_original')[0]), `[SERVER] ${message}`)
    assertOriginal(row, { code: 'SERVER', message })
  }
})

test('one-click current report loads only on click and exports native error, exact evidence, runtime and timing', async () => {
  await withClipboard(async (copied) => {
    const props = retry()
    Object.assign(props.node.data.current, { time: 1700000000000, seq: 40, provider: 'test-provider' })
    const capture = socket()
    Object.assign(capture.detail, { at: 1700000001000, startedAt: 1700000000000 })
    await renderRow('model-retry', props, { openDetails: false, response: reportPayload([capture, http(401, 'UNRELATED_CAPTURE')]), interact: async ({ row, click }) => {
      assert.equal(row.calls.length, 1)
      const next = await click(withClass(row.tree, 'bt_reportCopy')[0])
      assert.equal(next.calls.length, 1)
      assert.match(next.primary, /已复制/)
      assert.equal(copied.length, 1)
      const report = copied[0]
      for (const value of ['0.2.2-rc.2', '0.12.0', '[TRANSPORT] Connection error.', 'ECONNRESET', '987 ms']) assert.ok(report.includes(value), value)
      const recordedTime = new Date(props.node.data.current.time).toLocaleString('zh-CN', { hour12: false })
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      assert.ok(report.startsWith(`记录于${recordedTime} (${timeZone})`), 'uses the event record time in the reported local timezone')
      assert.match(report, /计划等待（非实测）/)
      assert.match(report, /截止生成本报告时/)
      assert.doesNotMatch(report, /生成报告时版本|分享前请检查正文中的敏感信息/)
      assert.match(report, /DSH 原生报错:/)
      assert.match(report, /插件捕获的底层报错:/)
      assert.doesNotMatch(report, /fetch failed|socket wrapper|seq: 40/, 'short report retains deepest evidence, not the entire diagnostic chain')
      assert.doesNotMatch(report, /session-client-test|fixture-attempt|UNRELATED_CAPTURE/)
    } })
  })
})

test('report reuses opened evidence and keeps allowlisted headers without exporting raw context or neighbors', async () => {
  await withClipboard(async (copied) => {
    const capture = http(503, 'Unavailable', failure)
    capture.detail.headers = { 'x-request-id': 'req-123', 'set-cookie': 'COOKIE_MUST_NOT_EXPORT', authorization: 'AUTH_HEADER_MUST_NOT_EXPORT' }
    capture.context.unrelated = 'CONTEXT_MUST_NOT_EXPORT'
    await renderRow('turn-error', terminal(), { response: reportPayload([capture]), interact: async ({ row, click }) => {
      const next = await click(withClass(row.tree, 'bt_reportCopy')[0])
      assert.equal(next.calls.length, 1)
      assert.match(copied[0], /req-123|HTTP 503/)
      assert.doesNotMatch(copied[0], /COOKIE_MUST_NOT_EXPORT|AUTH_HEADER_MUST_NOT_EXPORT|CONTEXT_MUST_NOT_EXPORT|session-client/)
    } })
  })
})

test('report with ambiguous captures omits candidates instead of guessing and reports incomplete', async () => {
  await withClipboard(async (copied) => {
    await renderRow('turn-error', terminal(), { openDetails: false, response: reportPayload([socket(), socket({ attemptId: 'second', detail: { kind: 'network', error: { message: 'OTHER_ATTEMPT_PRIVATE' } } })]), interact: async ({ row, click }) => {
      const next = await click(withClass(row.tree, 'bt_reportCopy')[0])
      assert.match(next.primary, /部分信息缺失/)
      assert.match(copied[0], /未取得唯一匹配的底层证据.*有多个候选，未混入报告/)
      assert.doesNotMatch(copied[0], /OTHER_ATTEMPT_PRIVATE|ECONNRESET/)
    } })
  })
})

test('report distinguishes disabled and unavailable capture from real API read failure', async () => {
  for (const [capture, expected] of [
    [{ installed: false, reason: 'config-disabled' }, '额外网络诊断已关闭'],
    [{ installed: false, reason: 'install-failed' }, '额外网络诊断不可用'],
  ]) {
    await withClipboard(async (copied) => {
      await renderRow('turn-error', terminal(), { openDetails: false, response: { ...reportPayload([]), capture }, interact: async ({ row, click }) => {
        const next = await click(withClass(row.tree, 'bt_reportCopy')[0])
        assert.ok(copied[0].includes(expected))
        assert.match(copied[0], /DSH 原生报错: \[TRANSPORT\] Connection error/)
        assert.doesNotMatch(copied[0], /读取失败|Capture |config-disabled|install-failed/)
        assert.match(next.primary, /已复制/)
      } })
    })
  }
})

test('time-selected identical failure evidence remains tentative in report and advice; explicit identity wins over time', async () => {
  const a = socket({ failureTime: 1000, attemptId: 'a', context: { sessionId: 'session-client-test', provider: 'test-provider', attemptId: 'a' } })
  const b = socket({ failureTime: 2000, attemptId: 'b', context: { sessionId: 'session-client-test', provider: 'test-provider', attemptId: 'b' }, detail: { ...socket().detail, error: { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' } } })
  await withClipboard(async (copied) => {
    const props = retry()
    props.node.data.current.time = 2003
    await renderRow('model-retry', props, { response: reportPayload([a, b]), interact: async ({ row, click }) => {
      assert.match(row.full, /关联未确认/)
      assertMainAdvice(row, '查看会话日志')
      const attempt = withClass(row.tree, 'bt_history')[0]
      assert.match(text(withClass(attempt, 'bt_captureAdvice')), /查看会话日志/)
      assert.match(text(withClass(attempt, 'bt_captureAdvice')), /API 域名/, 'tentative capture-specific advice remains scoped to evidence')
      await click(withClass(row.tree, 'bt_reportCopy')[0])
      assert.match(copied[0], /同一时间附近捕获到以下报错：/)
      assert.match(copied[0], /ENOTFOUND/)
      assert.doesNotMatch(copied[0], /ECONNRESET/)
    } })
    props.node.data.current.attemptId = 'a'
    const exact = await renderRow('model-retry', props, { response: reportPayload([a, b]) })
    assert.doesNotMatch(exact.full, /关联未确认/)
    assertMainAdvice(exact, '检查代理与上游连接')
    assert.match(text(withClass(exact.tree, 'bt_primary')), /ECONNRESET/)
    assert.doesNotMatch(text(withClass(exact.tree, 'bt_primary')), /ENOTFOUND/)
  })
})

test('AUTH report withholds arbitrary native and network free text even with obsolete Host data', async () => {
  await withClipboard(async (copied) => {
    const secret = 'ArbitraryCredentialEcho987654321'
    const props = terminal(secret, 'AUTH')
    const capture = http(401, secret, { code: 'AUTH', message: secret })
    capture.detail.body = secret
    capture.detail.error = { message: secret }
    await renderRow('turn-error', props, { openDetails: false, response: reportPayload([capture]), interact: async ({ row, click }) => {
      await click(withClass(row.tree, 'bt_reportCopy')[0])
      assert.doesNotMatch(copied[0], new RegExp(secret))
      assert.match(copied[0], /HTTP 401/)
      assert.match(copied[0], /认证正文已隐藏/)
    } })
  })
})

test('report failure still copies native diagnosis with explicit missing version and read failure', async () => {
  await withClipboard(async (copied) => {
    await renderRow('turn-error', terminal('native full error'), { openDetails: false, status: 503, interact: async ({ row, click }) => {
      const next = await click(withClass(row.tree, 'bt_reportCopy')[0])
      assert.match(next.primary, /部分信息缺失/)
      assert.match(copied[0], /native full error/)
      assert.match(copied[0], /读取失败: HTTP 503/)
      assert.match(copied[0], /截止生成本报告时: DSH 未记录.*Better Tips 未记录/)
      assert.doesNotMatch(copied[0], /not recorded|unavailable|Diagnosis unavailable/)
    } })
  })
})

test('successful report copy never adds report text; failed fallback disappears after a successful retry', async () => {
  let denied = true
  await withClipboard(async () => {
    await renderRow('turn-error', terminal(), { openDetails: false, response: reportPayload(), interact: async ({ row, click }) => {
      let next = await click(withClass(row.tree, 'bt_reportCopy')[0])
      assert.equal(withClass(next.tree, 'bt_reportText').length, 1)
      assert.doesNotMatch(next.full, /查看报告文本/)
      denied = false
      next = await click(withClass(next.tree, 'bt_reportCopy')[0])
      assert.equal(withClass(next.tree, 'bt_reportText').length, 0)
      assert.doesNotMatch(next.full, /查看报告文本|DSH 原生报错:/)
      assert.match(next.visible, /已复制/)
      assert.equal(next.calls.length, 1)
    } })
  }, async () => { if (denied) throw Error('clipboard denied') })
})

test('clipboard denial exposes selectable report text inline without a second upload or request', async () => {
  await withClipboard(async () => {
    await renderRow('turn-error', terminal(), { openDetails: false, response: reportPayload(), interact: async ({ row, click }) => {
      const next = await click(withClass(row.tree, 'bt_reportCopy')[0])
      assert.match(next.primary, /复制失败，可选择/)
      const report = withClass(next.tree, 'bt_reportText')[0]
      assert.equal(report.type, 'div')
      assert.equal(elements(report, 'summary').length, 0)
      assert.ok(next.visible.includes('DSH 原生报错:'))
      assert.match(text(report), /DSH 原生报错:.*Connection error/)
      assert.match(text(report), /插件捕获的底层报错:.*ECONNRESET/)
      assert.equal(next.calls.length, 1)
    } })
  }, async () => { throw Error('clipboard denied') })
})

test('compaction report marks temporal association and includes summary native failure without neighbor attempts', async () => {
  await withClipboard(async (copied) => {
    const record = { ...compactFailureRecord, attempts: [
      { failure: { code: 'SERVER', message: 'EARLIER_ATTEMPT_OMITTED' } },
      { failure: { code: 'SERVER', message: '503 summary native error' }, detail: http(503, 'Unavailable').detail },
    ] }
    await renderRow('manual-compaction', manualFailure, { openDetails: false, response: { ...compactions([record]), runtime: reportPayload().runtime }, interact: async ({ row, click }) => {
      await click(withClass(row.tree, 'bt_reportCopy')[0])
      assert.match(copied[0], /Compaction could not produce/)
      assert.match(copied[0], /503 summary native error/)
      assert.match(copied[0], /同一时间附近捕获到以下报错：\n摘要请求报错:/)
      assert.equal(copied[0].split('同一时间附近捕获到以下报错：').length - 1, 1)
      assert.match(copied[0], /插件捕获的底层报错: HTTP 503/)
      assert.doesNotMatch(copied[0], /仅时间关联|未确认属于本次请求|生成报告时版本|分享前请检查正文中的敏感信息/)
      assert.doesNotMatch(copied[0], /EARLIER_ATTEMPT_OMITTED/)
    } })
  })
})

test('compaction thrown AUTH report never recovers arbitrary authentication text', async () => {
  await withClipboard(async (copied) => {
    const secret = 'ArbitraryThrownCredentialEchoNotKeyShaped1234'
    const record = { ...compactFailureRecord, attempts: [{ thrown: { code: 'AUTH', message: secret }, detail: { kind: 'response', status: 401, body: secret, statusText: secret } }] }
    await renderRow('manual-compaction', manualFailure, { openDetails: false, response: { ...compactions([record]), runtime: reportPayload().runtime }, interact: async ({ row, click }) => {
      await click(withClass(row.tree, 'bt_reportCopy')[0])
      assert.doesNotMatch(copied[0], new RegExp(secret))
      assert.match(copied[0], /认证正文已隐藏/)
      assert.match(copied[0], /HTTP 401/)
    } })
  })
})

test('capture label is default and native original has one explicit disclosure without summary copy', async () => {
  const original = 'native message line one\nline two remains intact'
  const raw = { code: 'TRANSPORT', message: original }
  const row = await renderRow('turn-error', terminal(original), { openDetails: false, response: reportPayload([socket({ failure: raw })]) })
  assert.equal(withClass(row.tree, 'bt_source').length, 0)
  assert.doesNotMatch(row.primary, /DSH 原生报错 · 摘要|native message line one/)
  assertOriginal(row, raw)
  const network = withClass(row.tree, 'bt_network')[0]
  assert.equal(network.type, 'section')
  assert.match(text(elements(network, 'h4')[0]), /插件捕获的底层报错/)
  assert.match(text(elements(withClass(row.tree, 'bt_disclosure')[0], 'summary')[0]), /DSH 原生报错/)
  const attempts = [
    { ...retry('503 first failure', 'SERVER').node.data.current, retry: 1, seq: 20 },
    { ...retry('second failure', 'TRANSPORT').node.data.current, retry: 2, seq: 30 },
  ]
  const overview = await renderRow('model-retry', { ...retry(), node: { data: { attempts, current: attempts[1] } } }, { openDetails: false })
  assert.equal(withClass(overview.tree, 'bt_disclosure').length, 0, 'no duplicate latest capture/native wrapper around retry history')
  assert.equal(withClass(overview.tree, 'bt_reportCopy', true).length, 1)
  assertOriginal(overview, attempts[0].failure)
  assertOriginal(overview, attempts[1].failure)
})

test('outer summaries carry separate expand and collapse label branches without treating CSS as visual proof', async () => {
  await renderRow('turn-error', terminal(), { openDetails: false, interact: async ({ row, toggle }) => {
    const outer = withClass(row.tree, 'bt_disclosure')[0]
    const label = withClass(elements(outer, 'summary')[0], 'bt_toggleLabel')[0]
    assert.equal(withClass(label, 'bt_whenClosed').length, 1)
    assert.equal(withClass(label, 'bt_whenOpen').length, 1)
    assert.match(text(withClass(label, 'bt_whenClosed')[0]), /▶ 展开/)
    assert.match(text(withClass(label, 'bt_whenOpen')[0]), /▼ 收起/)
    assert.equal(outer.props.open, false)
    const next = await toggle(outer, true)
    assert.equal(withClass(next.tree, 'bt_disclosure')[0].props.open, true)
    // These assertions validate two semantic branches and state only. The helper
    // intentionally does not implement the stylesheet or certify rendered visibility.
    assert.equal(withClass(next.tree, 'bt_toggleLabel').length >= 1, true)
  } })
})

test('support report caps native, deepest evidence and response excerpts while UI and raw copy keep complete originals', async () => {
  await withClipboard(async (copied) => {
    const message = '原生😀'.repeat(350) + '\nNATIVE_TAIL_PRESERVED'
    const underlying = '底层😀'.repeat(200) + 'UNDERLYING_TAIL_PRESERVED'
    const response = '供应商😀'.repeat(180) + 'RESPONSE_TAIL_PRESERVED'
    const capture = socket({ failure: { code: 'TRANSPORT', message } })
    capture.detail.error = { code: 'ECONNRESET', message: underlying }
    capture.detail.body = JSON.stringify({ error: { message: response, extra: 'UNNECESSARY_PROVIDER_FIELD' } })
    await renderRow('turn-error', terminal(message), { response: reportPayload([capture]), interact: async ({ row, click }) => {
      assertOriginal(row, { code: 'TRANSPORT', message })
      assert.ok(row.full.includes(underlying), 'full native cause remains available in UI evidence')
      assert.ok(row.full.includes(response), 'full captured body remains available in UI evidence')
      await click(withClass(row.tree, 'bt_reportCopy')[0])
      const report = copied[0]
      assert.ok(Array.from(report).length < 2000, 'support message has bounded excerpts rather than full dumps')
      const nativeLine = report.split('\n').find((line) => line.startsWith('DSH 原生报错: '))
      const underlyingLine = report.split('\n').find((line) => line.startsWith('插件捕获的底层报错: '))
      const responseLine = report.split('\n').find((line) => line.startsWith('响应摘要: '))
      for (const [line, label, cap] of [[nativeLine, 'DSH 原生报错: ', 600], [underlyingLine, '插件捕获的底层报错: ', 300], [responseLine, '响应摘要: ', 300]]) {
        assert.ok(line, `${label} is present`)
        const excerpt = line.slice(label.length)
        assert.equal(Array.from(excerpt.split('… [')[0]).length, cap)
        assert.ok(excerpt.endsWith('… [已省略，全文见错误详情]'))
        assert.ok(!excerpt.includes('\uFFFD'), 'Unicode points are not cut into invalid surrogate halves')
      }
      assert.doesNotMatch(report, /NATIVE_TAIL_PRESERVED|UNDERLYING_TAIL_PRESERVED|RESPONSE_TAIL_PRESERVED|UNNECESSARY_PROVIDER_FIELD/)
      await click(elements(row.tree, 'button').find((node) => text(node) === '复制完整错误'))
    } })
    assert.equal(copied[1], '[TRANSPORT] ' + message, 'existing raw-error copy remains complete and unmodified')
  })
})

test('report does not repeat provider message already preserved in its native error and omits unrelated JSON fields', async () => {
  await withClipboard(async (copied) => {
    const providerMessage = '唯一供应商诊断内容'
    const message = '503: ' + JSON.stringify({ error: { message: providerMessage, code: 'overloaded_error' } })
    const original = { code: 'SERVER', message }
    const capture = http(503, 'Unavailable', original)
    capture.detail.body = JSON.stringify({ error: { message: providerMessage, code: 'overloaded_error', unrelated: 'BODY_METADATA_NOT_NEEDED' }, context: 'CONVERSATION_MUST_NOT_EXPORT' })
    await renderRow('turn-error', terminal(message, 'SERVER'), { response: reportPayload([capture]), interact: async ({ row, click }) => {
      await click(withClass(row.tree, 'bt_reportCopy')[0])
      assert.doesNotMatch(copied[0], /响应摘要:/, 'provider body does not create a second duplicate diagnostic section')
      assert.doesNotMatch(copied[0], /BODY_METADATA_NOT_NEEDED|CONVERSATION_MUST_NOT_EXPORT/)
      assert.match(copied[0], /DSH 原生报错:.*唯一供应商诊断内容/)
      assertOriginal(row, original)
    } })
  })
})

test('complete provider HTTP JSON wrapper becomes readable once in the short report while UI and raw copy retain JSON', async () => {
  for (const nested of [true, false]) {
    await withClipboard(async (copied) => {
      const providerMessage = '上游暂时不可用。\nSECOND_LINE_UNIQUE_PROVIDER_DIAGNOSTIC\n请稍后重试。'
      const diagnostic = { message: providerMessage, type: 'overloaded_error', code: 'overloaded_error', unrelated: 'NATIVE_WRAPPER_METADATA' }
      const wrapper = nested ? { error: diagnostic } : diagnostic
      const message = '503: ' + JSON.stringify(wrapper)
      const original = { code: 'SERVER', message }
      const capture = http(503, 'Service Unavailable', original)
      capture.detail.body = JSON.stringify({ error: { ...diagnostic, unrelated: 'RESPONSE_METADATA_NOT_NEEDED' } })
      await renderRow('turn-error', terminal(message, 'SERVER'), { response: reportPayload([capture]), interact: async ({ row, click }) => {
        assertOriginal(row, original)
        assert.ok(text(withClass(row.tree, 'bt_original')[0]).includes('\\n'), 'DSH original still contains the exact JSON escape sequence')
        await click(withClass(row.tree, 'bt_reportCopy')[0])
        const report = copied[0]
        assert.match(report, /DSH 原生报错: \[SERVER\] HTTP 503 上游暂时不可用。 SECOND_LINE_UNIQUE_PROVIDER_DIAGNOSTIC 请稍后重试。/)
        assert.equal(report.split('SECOND_LINE_UNIQUE_PROVIDER_DIAGNOSTIC').length - 1, 1, 'decoded multiline provider diagnostic appears only once, not again as response excerpt')
        assert.doesNotMatch(report, /响应摘要:|"(?:message|error|type|code|unrelated)"|overloaded_error|NATIVE_WRAPPER_METADATA|RESPONSE_METADATA_NOT_NEEDED|\\\\n/)
        assert.ok(report.length < 1000, 'support report remains concise without JSON scaffolding')
        await click(elements(row.tree, 'button').find((node) => text(node) === '复制完整错误'))
      } })
      assert.equal(copied[1], '[SERVER] ' + message, 'raw-error copy keeps complete original JSON rather than decoded report formatting')
    })
  }
})

test('short report never decodes a malformed or nonmessage HTTP wrapper into invented provider text', async () => {
  for (const message of ['503: {"error":{"message":"broken"}', '503: {"error":{"message":42}}', 'prefix 503: {"message":"not exact wrapper"}']) {
    await withClipboard(async (copied) => {
      await renderRow('turn-error', terminal(message, 'SERVER'), { openDetails: false, response: reportPayload([]), interact: async ({ row, click }) => {
        await click(withClass(row.tree, 'bt_reportCopy')[0])
        const nativeLine = copied[0].split('\n').find((line) => line.startsWith('DSH 原生报错: '))
        assert.equal(nativeLine, 'DSH 原生报错: [SERVER] ' + message)
        assertOriginal(row, { code: 'SERVER', message })
      } })
    })
  }
})

test('report missing fields stay concise Chinese and never claim export time is event occurrence time', async () => {
  await withClipboard(async (copied) => {
    await renderRow('turn-error', terminal(), { openDetails: false, response: details([]), interact: async ({ row, click }) => {
      await click(withClass(row.tree, 'bt_reportCopy')[0])
      assert.match(copied[0], /^记录于未记录/)
      assert.match(copied[0], /截止生成本报告时: DSH 未记录 · Better Tips 未记录/)
      assert.match(copied[0], /未取得唯一匹配的底层证据/)
      assert.doesNotMatch(copied[0], /Generated:|Request start:|Capture time:|not recorded|unavailable/)
      assert.ok(copied[0].split('\n').length <= 10, 'missing fields do not expand into a long checklist')
    } })
  })
})

test('all disclosure kinds keep one summary and one explicit depth wrapper with both toggle branches', async () => {
  const logSource = sessionFixture([
    logEvent(79, 'assistant/message', { text: 'neighbor stays contextual' }),
    logEvent(80, 'turn/end', { turn: 9, step: 3, error: failure }),
  ])
  const verifyStructure = (tree) => {
    const disclosures = elements(tree, 'details')
    assert.ok(disclosures.length > 0)
    for (const disclosure of disclosures) {
      assert.equal(disclosure.children.length, 2, 'details body has exactly one grouping wrapper')
      assert.equal(disclosure.children[0].type, 'summary')
      const body = disclosure.children[1]
      assert.equal(body.type, 'div')
      assert.ok(String(body.props.className ?? '').split(/\s+/).includes('bt_depth'))
      const toggle = withClass(disclosure.children[0], 'bt_toggleLabel')
      assert.equal(toggle.length, 1)
      assert.equal(withClass(toggle[0], 'bt_whenClosed').length, 1)
      assert.equal(withClass(toggle[0], 'bt_whenOpen').length, 1)
    }
  }
  await withClipboard(async () => {
    const candidates = [http(499, 'candidate A'), http(431, 'candidate B')]
    await renderRow('turn-error', terminalLog(80), { response: reportPayload(candidates), sessions: logSource.service, clickLog: true,
      interact: async ({ row, click }) => {
        const next = await click(withClass(row.tree, 'bt_reportCopy')[0])
        verifyStructure(next.tree)
      },
    })
  })
  const compacted = { time: 12100, summary: 'full summary', shadowedItemCount: 12, shadowedTokenCount: 800 }
  for (const [key, props, response] of [
    ['model-retry', retry(), reportPayload()],
    ['better-tips-compaction', autoFailure, compactions()],
    ['manual-compaction', manualFailure, compactions()],
    ['compaction', { sessionId: 'session-success', node: { data: compacted } }, compactions([])],
  ]) {
    const row = await renderRow(key, props, { response })
    verifyStructure(row.tree)
  }
})

test('upstream response truncation remains explicit independently of short-report excerpt limits', async () => {
  await withClipboard(async (copied) => {
    const capture = http(503, 'Unavailable', failure)
    capture.detail.body = 'partial upstream response'
    capture.detail.bodyState = 'truncated'
    await renderRow('turn-error', terminal(), { response: reportPayload([capture]), interact: async ({ row, click }) => {
      await click(withClass(row.tree, 'bt_reportCopy')[0])
      assert.match(copied[0], /响应状态: truncated/)
      assert.match(copied[0], /响应摘要: partial upstream response/)
      assert.doesNotMatch(copied[0], /已省略，全文见错误详情/, 'upstream capture truncation is not reported as support-message shortening')
      assert.match(row.full, /响应正文已截断/)
    } })
  })
})

test('changing current row aborts a pending report and cannot copy old-session output', async () => {
  await withClipboard(async (copied) => {
    const waiting = deferred()
    await renderRow('turn-error', terminalLog(80), { openDetails: false, respond: () => waiting.promise, interact: async ({ row, update, settle }) => {
      const task = withClass(row.tree, 'bt_reportCopy')[0].props.onClick()
      let next = await settle()
      assert.match(next.primary, /生成中/)
      next = await update({ ...terminalLog(90), sessionId: 'session-new-identity' })
      assert.equal(next.calls[0].options.signal.aborted, true)
      waiting.resolve(jsonResult(reportPayload()))
      await task
      next = await settle()
      assert.equal(copied.length, 0)
      assert.equal(withClass(next.tree, 'bt_reportText').length, 0)
    } })
  })
})
