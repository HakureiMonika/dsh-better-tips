import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs, { readFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { apply } from '../index.js'

/**
 * Offline contract test for the Host half: drives the real `agent/request-error`
 * listener with a fake Cordis context and a fake agent session, so the
 * waterfall etiquette, the durable retry pair, the per-step budget, and the
 * cancellation path are all exercised without a Harness or a provider.
 */

function harness (config, { connectionReady = true, services = {}, admission = { peer: { principal: { kind: 'owner' } } } } = {}) {
  const requestErrorHooks = []
  const listeners = [(payload, inner) => {
    const queue = [...requestErrorHooks]
    const next = () => queue.length ? queue.shift()(payload, next) : inner()
    return next()
  }]
  const streamListeners = []
  const events = []
  const disposers = []
  const routes = []
  const waiting = []
  const connection = { admit: () => admission, fetch: { register (route) {
    routes.push(route)
    return () => { const index = routes.indexOf(route); if (index >= 0) routes.splice(index, 1) }
  } } }
  const ctx = {
    inject (dependencies, callback) {
      assert.deepEqual(dependencies, ['connection'])
      const run = () => callback({ ...ctx, connection })
      if (connectionReady) run()
      else waiting.push(run)
    },
    on (name, listener, options) {
      if (name === 'agent/request-error') requestErrorHooks[options?.prepend ? 'unshift' : 'push'](listener)
      else if (name === 'llm/stream') streamListeners.push(listener)
      else assert.fail(`unexpected event listener: ${name}`)
      return () => {}
    },
    effect (callback, label = '') {
      const dispose = callback()
      disposers.push({ label, dispose })
      return dispose
    },
    get (name) {
      return name === 'connection' ? connection : services[name]
    },
    logger: { warn () {}, info () {} },
  }
  apply(ctx, { captureDetails: false, ...config })
  const payload = (overrides = {}) => ({
    agent: { id: 'session-1', session: { append: (type, data) => events.push({ type, data }) } },
    turn: 1,
    step: 1,
    provider: 'dingdongji',
    failure: { code: 'PI_AI_ERROR', message: 'Unterminated string in JSON at position 172' },
    signal: new AbortController().signal,
    ...overrides,
  })
  return { listeners, streamListeners, events, disposers, routes, payload,
    official (listener) { requestErrorHooks.splice(1, 0, listener) },
    connect: () => waiting.splice(0).forEach((run) => run()) }
}

test('the detail route mounts when connection arrives after plugin activation and unmounts on disposal', async () => {
  const { routes, connect, disposers } = harness({ extraRetries: 0 }, { connectionReady: false })
  assert.equal(routes.length, 0)
  connect()
  assert.equal(routes.length, 4, 'late service activation must install all four routes')
  const detail = routes.find((entry) => entry.path === '/api/better-tips/details')
  const result = await detail.fetch(new Request('http://localhost/api/better-tips/details?sessionId=session-1&turn=1'))
  assert.equal(result.status, 200)
  for (const entry of disposers) await entry.dispose()
  assert.equal(routes.length, 0, 'the routes belong to the dependency lifetime')
})

async function reportEnvironment (h, signal) {
  const route = h.routes.find((entry) => entry.path === '/api/better-tips/environment')
  return route.fetch(new Request('http://localhost/api/better-tips/environment', { signal }))
}

async function withInventoryManifests (run) {
  const root = await fs.mkdtemp(join(tmpdir(), 'better-tips-inventory-'))
  const manifests = new Map()
  const reads = new Map()
  const originalRead = fs.readFile
  try {
    const put = async (name, version, suffix = '') => {
      const directory = join(root, name.replace(/[^A-Za-z0-9]/g, '_') + suffix)
      await fs.mkdir(directory, { recursive: true })
      const manifestPath = join(directory, 'package.json')
      await fs.writeFile(manifestPath, JSON.stringify({ name, ...(version === undefined ? {} : { version }), privateConfig: 'DO_NOT_EXPORT_CONFIG' }))
      manifests.set(name + suffix, manifestPath)
      return manifestPath
    }
    fs.readFile = async (path, ...args) => { const key = String(path); reads.set(key, (reads.get(key) ?? 0) + 1); return originalRead(path, ...args) }
    syncBuiltinESMExports()
    await run({ put, manifests, reads, root })
  } finally {
    fs.readFile = originalRead; syncBuiltinESMExports()
    // root is the exact directory returned by mkdtemp above, owned by this fixture.
    await fs.rm(root, { recursive: true, force: true })
  }
}

test('report environment collects enabled host entries and bundles using exact Loader anchors', async () => {
  await withInventoryManifests(async ({ put, reads }) => {
    const plugin = await put('@fixture/plugin', '1.2.3')
    const otherVersion = await put('@fixture/plugin', '2.0.0', '-other')
    const core = await put('@deepseek-ai/core', '0.2.2-rc.2')
    const baseA = pathToFileURL(join(tmpdir(), 'tree-a.yml')).href
    const baseB = pathToFileURL(join(tmpdir(), 'tree-b.yml')).href
    const entries = [
      { options: { name: '@fixture/plugin/client' }, disabled: false, parent: { tree: { ctx: { baseUrl: baseA } } }, fiber: { state: 'failed' } },
      { options: { name: '@fixture/plugin/tools' }, disabled: false, parent: { tree: { ctx: { baseUrl: baseA } } } },
      { options: { name: '@fixture/plugin' }, disabled: false, parent: { tree: { ctx: { baseUrl: baseB } } } },
      { options: { name: '@deepseek-ai/core' }, disabled: false, parent: { tree: { ctx: { baseUrl: baseA } } } },
      { options: { name: 'official-addon/runtime' }, disabled: false, parent: { tree: { ctx: { baseUrl: baseA } } } },
      { options: { name: 'disabled-secret' }, disabled: true },
      { options: { name: 'group-secret', group: true }, disabled: false },
    ]
    const resolutions = []
    const h = harness({}, { services: {
      loader: { entries: () => entries },
      pluginPackages: { packageOf (name, anchor) { resolutions.push([name, anchor]); return { manifestPath: name === '@deepseek-ai/core' ? core : anchor === baseB ? otherVersion : plugin } } },
      pluginManager: { listBundles: async () => [
        { name: '@deepseek-ai/dsh-base', version: '0.2.2-rc.2', enabled: true, availability: 'installation', official: false, rows: [{ moduleName: '@deepseek-ai/core' }] },
        { name: 'official-addon', version: '1.0.0', enabled: true, availability: 'profile', official: true, rows: [{ moduleName: 'official-addon/runtime' }] },
        { name: '@deepseek-ai/third-party-fixture', version: '7.0.0', enabled: true, availability: 'profile', official: false },
        { name: '@fixture/plugin', version: '1.2.3', enabled: true, source: 'DO_NOT_EXPORT_SOURCE' },
        { name: '@fixture/config-preset', version: '3.4.5', enabled: true, rows: [] },
        { name: 'disabled-bundle', version: '9', enabled: false },
      ] },
    } })
    try {
      const response = await reportEnvironment(h)
      assert.equal(response.status, 200)
      const body = await response.json()
      assert.equal(body.runtime.pluginsStatus, 'complete')
      assert.deepEqual(body.runtime.enabledPlugins, [
        { name: '@deepseek-ai/third-party-fixture', version: '7.0.0' },
        { name: '@fixture/config-preset', version: '3.4.5' },
        { name: '@fixture/plugin', version: '1.2.3' },
        { name: '@fixture/plugin', version: '2.0.0' },
      ])
      assert.ok(resolutions.some(([name, anchor]) => name === '@fixture/plugin' && anchor === baseB))
      assert.equal(reads.get(plugin), 1, 'one manifest read per package path within this request')
      assert.doesNotMatch(JSON.stringify(body), /DO_NOT_EXPORT|tree-a|tree-b|disabled-|group-secret|manifestPath|"config":|"source":/)
      assert.ok(body.runtime.enabledPlugins.every((entry) => Object.keys(entry).sort().join(',') === 'name,version'))
    } finally { await disposeHarness(h) }
  })
})

test('report environment excludes native repository packages without relying on package-name prefix', async () => {
  await withInventoryManifests(async ({ put }) => {
    const native = await put('native-unscoped-plugin', '0.2.2-rc.2')
    await fs.writeFile(native, JSON.stringify({ name: 'native-unscoped-plugin', version: '0.2.2-rc.2', repository: { url: 'git+https://github.com/deepseek-ai/deepseek-harness.git' } }))
    const thirdParty = await put('@deepseek-ai/not-shipped-fixture', '9.0.0')
    const h = harness({}, { services: {
      loader: { entries: () => [native, thirdParty].map((path, index) => ({ disabled: false, options: { name: index ? '@deepseek-ai/not-shipped-fixture' : 'native-unscoped-plugin' } })) },
      pluginPackages: { packageOf: (name) => ({ manifestPath: name === 'native-unscoped-plugin' ? native : thirdParty }) },
      pluginManager: { listBundles: async () => [{ name: 'native-unscoped-plugin', version: '0.2.2-rc.2', enabled: true, availability: 'profile', official: false }] },
      agentPresets: {
        inspectCompositions: () => [],
        compositionInventory: async () => [{ id: 'fixture', rows: [
          { moduleName: 'native-unscoped-plugin', enabled: true },
          { moduleName: 'native-unscoped-plugin', enabled: 'conditional' },
          { moduleName: 'cordis:group', enabled: true },
          { moduleName: 'not-enabled-conditional', enabled: 'conditional' },
        ] }],
      },
    } })
    try {
      const body = await (await reportEnvironment(h)).json()
      assert.deepEqual(body.runtime.enabledPlugins, [{ name: '@deepseek-ai/not-shipped-fixture', version: '9.0.0' }])
      assert.equal(body.runtime.pluginsStatus, 'complete')
    } finally { await disposeHarness(h) }
  })
})

test('report environment recollects every request and rereads versions rather than caching the old roster', async () => {
  await withInventoryManifests(async ({ put }) => {
    const path = await put('fixture-changing', '1.0.0')
    let plugins = [{ moduleName: 'fixture-changing/client', enabled: true, fiberPhase: 'failed', config: 'DO_NOT_EXPORT' }]
    let bundles = [{ name: 'fixture-changing', version: '1.0.0', enabled: true }]
    let pluginCalls = 0
    let bundleCalls = 0
    const h = harness({}, { services: {
      pluginPackages: { packageOf: () => ({ manifestPath: path }) },
      pluginManager: { listPlugins: async () => { pluginCalls++; return plugins }, listBundles: async () => { bundleCalls++; return bundles } },
    } })
    try {
      const first = await (await reportEnvironment(h)).json()
      assert.deepEqual(first.runtime.enabledPlugins, [{ name: 'fixture-changing', version: '1.0.0' }])
      await fs.writeFile(path, JSON.stringify({ name: 'fixture-changing', version: '1.1.0' }))
      bundles = [{ name: 'fixture-changing', version: '1.1.0', enabled: true }]
      const second = await (await reportEnvironment(h)).json()
      assert.deepEqual(second.runtime.enabledPlugins, [{ name: 'fixture-changing', version: '1.1.0' }])
      plugins = [{ moduleName: 'fixture-changing', enabled: false }]
      bundles = []
      const third = await (await reportEnvironment(h)).json()
      assert.deepEqual(third.runtime.enabledPlugins, [])
      assert.equal(third.runtime.pluginsStatus, 'complete')
      assert.equal(pluginCalls, 3)
      assert.equal(bundleCalls, 3)
    } finally { await disposeHarness(h) }
  })
})

test('report environment keeps large lists complete and marks missing or invalid versions honestly', async () => {
  await withInventoryManifests(async ({ put }) => {
    const missingVersion = await put('fixture-no-version', undefined)
    const h = harness({}, { services: {
      pluginPackages: { packageOf (name) { return name === 'fixture-no-version' ? { manifestPath: missingVersion } : undefined } },
      pluginManager: { listPlugins: async () => [
        { moduleName: 'fixture-no-version/subpath', enabled: true }, { moduleName: 'fixture-unresolved', enabled: true },
      ], listBundles: async () => [
        ...Array.from({ length: 137 }, (_, index) => ({ name: 'fixture-bundle-' + index, version: '1.0.0', enabled: true })),
        { name: 'fixture-bad-version', version: 'D:\\PRIVATE\\token=secret', enabled: true },
      ] },
    } })
    try {
      const body = await (await reportEnvironment(h)).json()
      assert.equal(body.runtime.enabledPlugins.length, 140)
      assert.equal(body.runtime.pluginsStatus, 'partial')
      for (const name of ['fixture-no-version', 'fixture-unresolved', 'fixture-bad-version']) {
        assert.deepEqual(body.runtime.enabledPlugins.find((entry) => entry.name === name), { name, version: null })
      }
      assert.doesNotMatch(JSON.stringify(body), /PRIVATE|token=|manifestPath/)
    } finally { await disposeHarness(h) }
  })
})

test('report environment reports unavailable or partial service inventories without leaking errors', async () => {
  for (const [services, expectedStatus, expectedNames] of [
    [{}, 'unavailable', []],
    [{ pluginManager: { listPlugins: async () => { throw Error('PRIVATE_PATH_AND_TOKEN') }, listBundles: async () => [{ name: 'fixture-config', version: '1', enabled: true }] } }, 'partial', ['fixture-config']],
    [{ loader: { entries: () => { throw Error('PRIVATE_PATH_AND_TOKEN') } } }, 'unavailable', []],
  ]) {
    const h = harness({}, { services })
    try {
      const body = await (await reportEnvironment(h)).json()
      assert.equal(body.runtime.pluginsStatus, expectedStatus)
      assert.deepEqual(body.runtime.enabledPlugins.map((entry) => entry.name), expectedNames)
      assert.doesNotMatch(JSON.stringify(body), /PRIVATE_PATH_AND_TOKEN/)
    } finally { await disposeHarness(h) }
  }
})

test('report environment includes preset composition packages without exporting preset internals', async () => {
  await withInventoryManifests(async ({ put }) => {
    const path = await put('fixture-preset-tool', '4.5.6')
    const anchor = pathToFileURL(join(tmpdir(), 'private-preset.yml')).href
    const h = harness({}, { services: {
      loader: { entries: () => [] },
      pluginManager: { listBundles: async () => [] },
      pluginPackages: { packageOf (name, base) { assert.equal(name, 'fixture-preset-tool'); assert.equal(base, anchor); return { manifestPath: path } } },
      agentPresets: {
        inspectCompositions: () => [{ id: 'private-preset-id', modules: [{ moduleName: 'fixture-preset-tool/tools', baseUrl: anchor, useHostBase: false }], leakedServices: ['DO_NOT_EXPORT'] }],
        compositionInventory: async () => [{ id: 'private-preset-id', rows: [
          { moduleName: 'fixture-preset-tool/tools', enabled: true },
          { moduleName: 'fixture-failed-preset-entry', enabled: true, fiberState: 'failed' },
          { moduleName: 'fixture-disabled-preset-entry', enabled: false },
          { moduleName: 'fixture-conditional-preset-entry', enabled: 'conditional', condition: 'PRIVATE_CONDITION' },
        ] }],
      },
    } })
    try {
      const body = await (await reportEnvironment(h)).json()
      assert.equal(body.runtime.pluginsStatus, 'partial')
      assert.deepEqual(body.runtime.enabledPlugins, [{ name: 'fixture-failed-preset-entry', version: null }, { name: 'fixture-preset-tool', version: '4.5.6' }])
      assert.doesNotMatch(JSON.stringify(body), /private-preset|DO_NOT_EXPORT|PRIVATE_CONDITION|disabled-preset|conditional-preset|baseUrl/)
    } finally { await disposeHarness(h) }
  })
})

test('report environment requires authenticated owner before collecting inventory and honors cancellation', async () => {
  for (const [admission, status] of [[{ rejection: 401 }, 401], [{ peer: { principal: { kind: 'guest' } } }, 403]]) {
    let reads = 0
    const h = harness({}, { admission, services: { pluginManager: { listPlugins () { reads++; return [] }, listBundles () { reads++; return [] } } } })
    try {
      const response = await reportEnvironment(h)
      assert.equal(response.status, status)
      assert.equal(reads, 0)
    } finally { await disposeHarness(h) }
  }
  const controller = new AbortController()
  const h = harness({}, { services: { pluginManager: { listBundles: async () => { controller.abort(); return [] }, listPlugins: async () => { assert.fail('must stop after cancellation') } } } })
  try { assert.equal((await reportEnvironment(h, controller.signal)).status, 499) } finally { await disposeHarness(h) }
})

test('diagnostic routes share cached versions from the actual launch and plugin manifests', async () => {
  const originalRead = fs.readFile
  const oldInstall = process.env.DSH_INSTALL_DIR
  const installed = oldInstall ?? 'D:\\DSH\\Desktop\\resources\\app.asar\\dsh\\node_modules\\@deepseek-ai\\dsh'
  process.env.DSH_INSTALL_DIR = installed
  // The bundled Node cannot traverse app.asar; the current Electron runtime can.
  // A dedicated Electron invocation below exercises this same route test there.
  let expectedDsh
  try { expectedDsh = JSON.parse(await originalRead(join(installed, 'package.json'), 'utf8')) }
  catch { expectedDsh = undefined }
  const expectedPlugin = JSON.parse(await originalRead(new URL('../package.json', import.meta.url), 'utf8'))
  const reads = []
  fs.readFile = async (path, ...args) => { reads.push(String(path)); return originalRead(path, ...args) }
  syncBuiltinESMExports()
  const h = harness({ extraRetries: 0 })
  try {
    const [details, compact] = await Promise.all([requestDetails(h), compactionRecords(h)])
    assert.equal(details.runtime.pluginVersion, expectedPlugin.version)
    if (expectedDsh) assert.equal(details.runtime.dshVersion, expectedDsh.version)
    else assert.equal(details.runtime.dshVersion, null, 'unreadable installed manifest is unknown, not Electron or a constant')
    assert.deepEqual(compact.runtime, details.runtime)
    const count = reads.length
    await requestDetails(h)
    await compactionRecords(h)
    assert.equal(reads.length, count, 'one in-flight/completed Promise is shared across both routes')
    assert.deepEqual(details.items, [])
    assert.deepEqual(compact.records, [])
  } finally {
    await disposeHarness(h)
    fs.readFile = originalRead; syncBuiltinESMExports()
    if (oldInstall === undefined) delete process.env.DSH_INSTALL_DIR
    else process.env.DSH_INSTALL_DIR = oldInstall
  }
})

test('unreadable or malformed runtime manifests degrade to null without breaking routes', async () => {
  const originalRead = fs.readFile
  try {
    for (const fail of [async () => { throw Object.assign(new Error('fixture ENOENT'), { code: 'ENOENT' }) }, async () => '{malformed']) {
      let reads = 0
      fs.readFile = async () => { reads++; return fail() }
      syncBuiltinESMExports()
      const h = harness({ extraRetries: 0 })
      try {
        const details = await requestDetails(h)
        const compact = await compactionRecords(h)
        assert.deepEqual(details.runtime, { dshVersion: null, pluginVersion: null })
        assert.deepEqual(compact.runtime, details.runtime)
        assert.equal(details.capture.installed, false)
        const count = reads
        await requestDetails(h)
        assert.equal(reads, count, 'failed manifest reads are cached too')
      } finally { await disposeHarness(h) }
    }
  } finally { fs.readFile = originalRead; syncBuiltinESMExports() }
})

test('metadata route reads one exact durable event and closes its read-only handle', async () => {
  const calls = []
  const event = { seq: 7, type: 'llm/retry', data: { failure: { message: 'unknown native error' } } }
  const persistence = { async open (id, access) {
    calls.push([id, access])
    return { async read (seq, count) { calls.push([seq, count]); return { events: [event] } }, async close () { calls.push('closed') } }
  } }
  const { routes } = harness({}, { services: { sessionPersistence: persistence } })
  const response = await routes.find((r) => r.path.endsWith('/log-metadata')).fetch(new Request('http://localhost/api/better-tips/log-metadata?sessionId=session-1&seq=7'))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.log.seq, 7)
  assert.equal(body.log.status, 'unavailable')
  assert.deepEqual(body.sources, [])
  assert.deepEqual(calls, [['session-1', 'read'], [7, 1], 'closed'])
})

test('metadata uses rc2 sessionQuery.inspectSession exact getter and cancellation before a pending durable write', async () => {
  const calls = []
  const event = Object.freeze({ seq: 7, type: 'llm/retry', data: Object.freeze({ failure: Object.freeze({ message: 'unknown native error' }) }) })
  const request = new Request('http://localhost/api/better-tips/log-metadata?sessionId=session-1&seq=7')
  const { routes } = harness({}, { services: {
    sessionController: { inspect () { assert.fail('obsolete controller inspection is not an rc2 API') } },
    sessionQuery: { async inspectSession (id, read, signal) {
      calls.push(id)
      assert.equal(signal, request.signal)
      assert.equal(typeof read, 'function')
      const result = read({ eventAt (seq) { calls.push(seq); return seq === 7 ? event : undefined } })
      assert.equal(result?.then, undefined, 'domain getter must be synchronous')
      assert.deepEqual(result, event)
      assert.notEqual(result, event, 'the borrowed Session event must be detached')
      assert.notEqual(result.data, event.data)
      return result
    } },
    sessionPersistence: { open () { assert.fail('must not read stale persisted prefix') } },
  } })
  const response = await routes.find((r) => r.path.endsWith('/log-metadata')).fetch(request)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).log.seq, 7)
  assert.deepEqual(calls, ['session-1', 7])
})

test('metadata does not substitute a durable event when rc2 live-preferred query has no exact seq', async () => {
  const h = harness({}, { services: {
    sessionQuery: { async inspectSession (id, read) { return read({ eventAt (seq) { assert.equal(seq, 7); return undefined } }) } },
    sessionPersistence: { open () { assert.fail('must not substitute a different source after exact live read') } },
  } })
  try {
    const response = await h.routes.find(r => r.path.endsWith('/log-metadata')).fetch(new Request('http://localhost/api/better-tips/log-metadata?sessionId=session-1&seq=7'))
    assert.equal(response.status, 404)
    assert.match((await response.json()).error, /exact event not available/)
  } finally { await disposeHarness(h) }
})

test('metadata route refuses nonowners and malformed coordinates before reading storage', async () => {
  for (const [admission, query, status] of [
    [{ rejection: 401 }, 'sessionId=session-1&seq=7', 401],
    [{ peer: { principal: { kind: 'limited' } } }, 'sessionId=session-1&seq=7', 403],
    [{ peer: { principal: { kind: 'owner' } } }, 'sessionId=session-1&seq=', 400],
    [{ peer: { principal: { kind: 'owner' } } }, 'sessionId=../bad&seq=7', 400],
  ]) {
    const { routes } = harness({}, { admission, services: { sessionPersistence: { open () { assert.fail('must not open') } } } })
    const response = await routes.find((r) => r.path.endsWith('/log-metadata')).fetch(new Request(`http://localhost/api/better-tips/log-metadata?${query}`))
    assert.equal(response.status, status)
  }
})

function delegateRecorder () {
  const calls = { count: 0 }
  const next = async () => {
    calls.count++
    return undefined
  }
  return { calls, next }
}

test('a listed failure is retried once for the budget and then delegated', async () => {
  const { listeners, events, payload } = harness({ extraRetries: 2, initialDelayMs: 0, jitterRatio: 0 })
  const listener = listeners[0]
  const { calls, next } = delegateRecorder()
  const agentPayload = payload()

  const first = await listener(agentPayload, next)
  const second = await listener(agentPayload, next)
  const third = await listener(agentPayload, next)

  assert.deepEqual(first, { kind: 'retry' })
  assert.deepEqual(second, { kind: 'retry' })
  assert.equal(third, undefined)
  assert.equal(calls.count, 1, 'the exhausted budget must delegate exactly once')

  const retries = events.filter((event) => event.type === 'llm/retry')
  const started = events.filter((event) => event.type === 'llm/retry-started')
  assert.equal(retries.length, 2)
  assert.equal(started.length, 2)
  assert.deepEqual(retries.map((event) => event.data.retry), [1, 2])
  assert.equal(retries[0].data.maxRetries, 2)
  assert.equal(retries[0].data.mode, 'normal')
  assert.equal(retries[0].data.provider, 'dingdongji')
  assert.equal(retries[0].data.turn, 1)
  assert.equal(retries[0].data.step, 1)
  assert.equal(retries[0].data.failure.message, agentPayload.failure.message)
  assert.equal(retries[0].data.retryId, retries[1].data.retryId, 'one chain keeps one retry id')
  assert.deepEqual(started.map((event) => event.data.retry), [1, 2])
})

test('hard-denied and unlisted codes never reach the log', async () => {
  for (const code of ['AUTH', 'QUOTA', 'CONTEXT_WINDOW_EXCEEDED', 'INVALID_REQUEST']) {
    const { listeners, events, payload } = harness({ extraRetries: 3, initialDelayMs: 0 })
    const { calls, next } = delegateRecorder()
    const result = await listeners[0](payload({ failure: { code, message: '401 invalid api key' } }), next)
    assert.equal(result, undefined, code)
    assert.equal(calls.count, 1, code)
    assert.equal(events.length, 0, code)
  }
})

test('an aborted turn delegates instead of scheduling a retry', async () => {
  const { listeners, events, payload } = harness({ extraRetries: 3, initialDelayMs: 0 })
  const { calls, next } = delegateRecorder()
  const controller = new AbortController()
  controller.abort()
  const result = await listeners[0](payload({ signal: controller.signal }), next)
  assert.equal(result, undefined)
  assert.equal(calls.count, 1)
  assert.equal(events.length, 0)
})

test('the provider-requested delay is persisted on the attempt', async () => {
  const { listeners, events, payload } = harness({ extraRetries: 1, initialDelayMs: 0 })
  await listeners[0](payload({ failure: { code: 'RATE_LIMIT', message: '429 slow down', providerRetryAfterMs: 7 } }), async () => undefined)
  assert.equal(events[0].type, 'llm/retry')
  assert.equal(events[0].data.delayMs, 7)
})

test('disposal aborts a pending wait and never starts the retry', async () => {
  const { listeners, disposers, events, payload } = harness({ extraRetries: 1, initialDelayMs: 60000 })
  const controller = new AbortController()
  const { next } = delegateRecorder()
  const pending = listeners[0](payload({ signal: controller.signal }), next)
  // The attempt is durable before the wait begins.
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'llm/retry')
  const lifetime = disposers.find((entry) => entry.label.includes('abort and drain'))
  assert.ok(lifetime, 'the lifetime disposer must be registered')
  await lifetime.dispose()
  assert.equal(await pending, undefined)
  assert.equal(events.filter((event) => event.type === 'llm/retry-started').length, 0)
})

test('a session without append is left untouched', async () => {
  const { listeners, payload } = harness({ extraRetries: 3 })
  const { calls, next } = delegateRecorder()
  const result = await listeners[0](payload({ agent: { id: 'session-1' } }), next)
  assert.equal(result, undefined)
  assert.equal(calls.count, 1)
})

async function driveRequestFailure (h, failure, { sessionId = 'session-1', provider = 'dingdongji', model = 'model-fixture', url = 'https://llm.example/v1/chat', consumeBody = false, cloneFailure = false } = {}) {
  const options = { sessionId, provider, model, purpose: 'agent', signal: new AbortController().signal }
  const stream = h.streamListeners[0].call({}, options, () => (async function * () {
    try {
      const response = await globalThis.fetch(url)
      if (consumeBody) await response.text()
    } catch { /* The adapter reports this same failure object in its finish chunk. */ }
    yield { type: 'finish', reason: { kind: 'error', failure } }
  })())
  for await (const chunk of stream) assert.equal(chunk.reason.failure, failure)
  await h.listeners[0](h.payload({
    agent: { id: sessionId, session: { append: (type, data) => h.events.push({ type, data }) } }, provider, failure: cloneFailure ? structuredClone(failure) : failure,
  }), async () => undefined)
}

async function requestDetails (h, sessionId = 'session-1') {
  const route = h.routes.find((candidate) => candidate.path === '/api/better-tips/details')
  return (await route.fetch(new Request(`http://localhost/api/better-tips/details?sessionId=${sessionId}&turn=1`))).json()
}

async function disposeHarness (h) {
  for (const entry of h.disposers) await entry.dispose()
}

test('a failed request is correlated by its stream context and served with provenance', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'bad request' } }), {
    status: 431, statusText: 'Request Header Fields Too Large',
    headers: { 'content-type': 'application/json', server: 'cloudflare', 'cf-ray': '8f00-SIN' },
  })
  const h = harness({ captureDetails: true, extraRetries: 0 })
  try {
    const failure = Object.freeze({ code: 'PI_AI_ERROR', message: '431 431 Request Header Fields Too Large' })
    await driveRequestFailure(h, failure, { url: 'https://llm.example/v1/chat?api_key=SECRET', consumeBody: true, cloneFailure: true })
    const body = await requestDetails(h)
    assert.equal(body.items.length, 1)
    const item = body.items[0]
    assert.equal(item.step, 1)
    assert.equal(item.provider, 'dingdongji')
    assert.equal(item.context.model, 'model-fixture')
    assert.equal(item.provenance, 'request-context')
    assert.equal(typeof item.attemptId, 'string')
    assert.ok(Number.isFinite(item.failureTime))
    assert.equal(item.failureIndex, 1)
    assert.equal(item.detail.kind, 'response')
    assert.equal(item.detail.status, 431)
    assert.equal(item.detail.headers.server, 'cloudflare')
    assert.equal(item.detail.headers['cf-ray'], '8f00-SIN')
    assert.equal(typeof item.detail.bodyState, 'string', 'body progress is distinct from empty body')
    assert.equal(body.capture.installed, true)
    assert.deepEqual(body.capture.recent, [])
    assert.equal(JSON.stringify(body).includes('SECRET'), false)
  } finally { await disposeHarness(h); globalThis.fetch = originalFetch }
})

test('the network-detail route answers with an empty list and refuses bad input', async () => {
  const { routes } = harness({ extraRetries: 1 })
  const route = routes.find((candidate) => candidate.path === '/api/better-tips/details')
  assert.ok(route)
  assert.deepEqual(route.methods, ['GET'])
  const response = await route.fetch(new Request('http://localhost/api/better-tips/details?sessionId=session-1&turn=3'))
  assert.equal(response.status, 200)
  const { runtime, ...body } = await response.json()
  assert.deepEqual(body, { sessionId: 'session-1', turn: 3, items: [], capture: { installed: false, reason: 'config-disabled' } })
  assert.equal(typeof runtime, 'object')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal((await route.fetch(new Request('http://localhost/api/better-tips/details?sessionId=%2Fetc%2Fpasswd&turn=3'))).status, 400)
  assert.equal((await route.fetch(new Request('http://localhost/api/better-tips/details?sessionId=session-1&turn=nope'))).status, 400)
})

test('a flattened transport failure preserves the native chain from its own iterator scope', async () => {
  const originalFetch = globalThis.fetch
  const socketError = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) })
  globalThis.fetch = async () => { throw socketError }
  const h = harness({ captureDetails: true, extraRetries: 0 })
  try {
    await driveRequestFailure(h, { code: 'TRANSPORT', message: 'Connection error.' })
    const { items } = await requestDetails(h)
    assert.equal(items.length, 1)
    assert.equal(items[0].detail.kind, 'network')
    assert.equal(items[0].detail.host, 'llm.example')
    assert.equal(items[0].detail.error.cause.code, 'UND_ERR_SOCKET')
    assert.equal(items[0].approximate, false)
    assert.equal(items[0].provenance, 'request-context')
  } finally { await disposeHarness(h); globalThis.fetch = originalFetch }
})

test('identical errors in one step retain separate immutable attempt identities', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => new Response(String(url), { status: 502 })
  const h = harness({ captureDetails: true, extraRetries: 0 })
  try {
    for (const host of ['first.example', 'second.example']) {
      await driveRequestFailure(h, { code: 'SERVER', message: '502 status code (no body)' }, { url: `https://${host}/v1/chat` })
    }
    const { items } = await requestDetails(h)
    assert.equal(items.length, 2)
    assert.deepEqual(items.map((item) => item.detail.host), ['first.example', 'second.example'])
    assert.equal(new Set(items.map((item) => item.attemptId)).size, 2)
    assert.deepEqual(items.map((item) => item.failureIndex), [1, 2])
    assert.deepEqual(items.map((item) => item.failure.message), ['502 status code (no body)', '502 status code (no body)'])
  } finally { await disposeHarness(h); globalThis.fetch = originalFetch }
})

test('official-handled identical cloned failures are observed before recovery consumes them', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('', { status: 502 })
  const h = harness({ captureDetails: true, extraRetries: 0 })
  let officialCalls = 0
  h.official(async (payload, next) => ++officialCalls === 1 ? { kind: 'retry' } : next())
  try {
    for (const host of ['first.example', 'last.example']) await driveRequestFailure(h,
      { code: 'SERVER', message: '502 status code (no body)' }, { url: `https://${host}/v1/chat`, cloneFailure: true })
    const body = await requestDetails(h)
    assert.deepEqual(body.items.map((item) => item.detail.host), ['first.example', 'last.example'])
    assert.equal(new Set(body.items.map((item) => item.attemptId)).size, 2)
    assert.equal(officialCalls, 2)
  } finally { await disposeHarness(h); globalThis.fetch = originalFetch }
})

test('unknown unscoped failures never inherit a nearby global network capture', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('', { status: 502 })
  const h = harness({ captureDetails: true, extraRetries: 0 })
  try {
    await globalThis.fetch('https://unrelated.example/v1/chat')
    await h.listeners[0](h.payload({ failure: { code: 'SERVER', message: '502 status code (no body)' } }), async () => undefined)
    const body = await requestDetails(h)
    assert.deepEqual(body.items, [])
    assert.equal(body.capture.installed, true)
  } finally { await disposeHarness(h); globalThis.fetch = originalFetch }
})

test('concurrent session B network errors cannot leak into session A evidence', async () => {
  const originalFetch = globalThis.fetch
  let releaseA
  let markAStarted
  const aStarted = new Promise((resolve) => { markAStarted = resolve })
  const aWait = new Promise((resolve) => { releaseA = resolve })
  globalThis.fetch = async (url) => {
    if (String(url).includes('a.example')) { markAStarted(); await aWait }
    return new Response('', { status: 502 })
  }
  const h = harness({ captureDetails: true, extraRetries: 0 })
  try {
    const a = driveRequestFailure(h, { code: 'SERVER', message: 'same failure' }, { sessionId: 'session-A', provider: 'provider-A', url: 'https://a.example/v1/chat' })
    await aStarted
    await driveRequestFailure(h, { code: 'SERVER', message: 'same failure' }, { sessionId: 'session-B', provider: 'provider-B', url: 'https://b.example/v1/chat' })
    releaseA()
    await a
    const aBody = await requestDetails(h, 'session-A')
    const bBody = await requestDetails(h, 'session-B')
    assert.equal(aBody.items[0].detail.host, 'a.example')
    assert.equal(bBody.items[0].detail.host, 'b.example')
    assert.equal(aBody.items[0].provider, 'provider-A')
    assert.notEqual(aBody.items[0].attemptId, bBody.items[0].attemptId)
  } finally { releaseA(); await disposeHarness(h); globalThis.fetch = originalFetch }
})

test('a protocol failure with no network exception has scoped provenance but no invented capture', async () => {
  const h = harness({ captureDetails: true, extraRetries: 0 })
  try {
    const failure = { code: 'TRANSPORT', message: 'Stream ended without finish_reason' }
    for await (const _ of h.streamListeners[0].call({}, { sessionId: 'session-1', provider: 'dingdongji' }, () => streamOf([{ type: 'finish', reason: { kind: 'error', failure } }]))) {}
    await h.listeners[0](h.payload({ failure }), async () => undefined)
    const { items } = await requestDetails(h)
    assert.equal(items.length, 1)
    assert.equal(items[0].provenance, 'request-context')
    assert.equal(items[0].detail, undefined)
  } finally { await disposeHarness(h) }
})

// --- context compaction -------------------------------------------------

function streamOf (chunks) {
  return (async function * () {
    for (const chunk of chunks) yield chunk
  })()
}

const COMPACTION_OPTIONS = {
  provider: 'dingdongji',
  model: 'deepseek-chat',
  messages: [],
  purpose: 'compaction',
  sessionId: 'session-1',
}

const STOP = [{ type: 'text-delta', index: 0, text: 'summary' }, { type: 'finish', reason: { kind: 'stop' } }]
const SERVER_FAILURE = [{ type: 'finish', reason: { kind: 'error', failure: { code: 'SERVER', message: '502 status code (no body)' } } }]

function runtimeHarness (h, adapter, middleware = []) {
  const stats = { dispatches: 0, adapterCalls: 0, middlewareCalls: middleware.map(() => 0) }
  const runtime = {
    stream (options) {
      stats.dispatches++
      const queue = [
        ...h.streamListeners,
        ...middleware.map((listener, index) => function (options, next) {
          stats.middlewareCalls[index]++
          return listener.call(this, options, next)
        }),
      ]
      const inner = (options) => { stats.adapterCalls++; return adapter(options, stats.adapterCalls) }
      const next = () => (queue.shift() ?? inner).call(runtime, options, next)
      return next()
    },
  }
  return { runtime, stats }
}

async function collect (stream) { const chunks = []; for await (const chunk of stream) chunks.push(chunk); return chunks }
async function compactionRecords (h, sessionId = 'session-1') {
  const route = h.routes.find((entry) => entry.path === '/api/better-tips/compaction')
  return (await route.fetch(new Request(`http://localhost/api/better-tips/compaction?sessionId=${encodeURIComponent(sessionId)}`))).json()
}

test('compaction retries re-dispatch every attempt through two downstream middleware layers', async () => {
  const h = harness({ compactionRetries: 2, initialDelayMs: 0, jitterRatio: 0 })
  const trace = []
  const middleware = ['one', 'two'].map((name) => function (options, next) { trace.push(name); return next() })
  const { runtime, stats } = runtimeHarness(h, (_, calls) => streamOf(calls === 1 ? SERVER_FAILURE : STOP), middleware)
  const seen = await collect(runtime.stream({ ...COMPACTION_OPTIONS }))
  assert.equal(stats.adapterCalls, 2)
  assert.deepEqual(stats.middlewareCalls, [2, 2], 'both middleware execute on first attempt and retry')
  assert.deepEqual(trace, ['one', 'two', 'one', 'two'])
  assert.deepEqual(seen, STOP, 'failed partial chunks never concatenate with the clean retry')
  const { records } = await compactionRecords(h)
  assert.equal(records.length, 1)
  const record = records[0]
  assert.equal(record.status, 'ok')
  assert.equal(record.attempts.length, 2)
  assert.equal(record.delays.length, 1)
  assert.equal(record.attempts[0].failure.code, 'SERVER')
  assert.equal(record.attempts[0].finishReason, 'error')
  assert.equal(record.attempts[1].finishReason, 'stop')
  assert.equal(record.attempts[0].failure.status, 502)
  assert.ok(Number.isFinite(record.durationMs))
  await disposeHarness(h)
})

test('compaction infers status only from explicit 400..599 provider HTTP formats', async () => {
  const h = harness({ compactionRetries: 0 })
  try {
    for (const [message, expected] of [
      ['503: {"message":"overloaded"}', 503], ['431 status code (no body)', 431],
      ['504 status code (no body)', 504], ['HTTP 502: upstream unavailable', 502],
      ['  HTTP 429 status code (no body)', 429], ['400: invalid request', 400], ['599: gateway failure', 599],
      ['200: not an error', undefined], ['399 status code', undefined], ['600: invalid status', undefined],
      ['999 failures recorded', undefined], ['431 retries remain', undefined], ['503 things failed', undefined],
      ['503', undefined], ['503foo', undefined], ['1503: not a three digit status', undefined],
      ['prefix 503: not a status prefix', undefined], ['503:opaque prose', undefined],
    ]) {
      const failure = { code: 'SERVER', message }
      const { runtime } = runtimeHarness(h, () => streamOf([{ type: 'finish', reason: { kind: 'error', failure } }]))
      await collect(runtime.stream({ ...COMPACTION_OPTIONS }))
      const attempt = (await compactionRecords(h)).records.at(-1).attempts[0]
      assert.equal(attempt.failure.status, expected, message)
      assert.equal(attempt.failure.message, message, 'status extraction never rewrites original')
    }
    const explicit = { code: 'SERVER', message: '503 attempts exhausted', status: 502 }
    const { runtime } = runtimeHarness(h, () => streamOf([{ type: 'finish', reason: { kind: 'error', failure: explicit } }]))
    await collect(runtime.stream({ ...COMPACTION_OPTIONS }))
    assert.equal((await compactionRecords(h)).records.at(-1).attempts[0].failure.status, 502, 'structured provider status remains authoritative')
  } finally { await disposeHarness(h) }
})

test('per-step detail history retains eight failures and still evicts beyond its bound', async () => {
  const h = harness({ extraRetries: 0 })
  try {
    for (let index = 1; index <= 9; index++) {
      const failure = { code: 'SERVER', message: '503: failure-' + index }
      await collect(h.streamListeners[0].call({}, { sessionId: 'session-1', provider: 'dingdongji', purpose: 'agent' },
        () => streamOf([{ type: 'finish', reason: { kind: 'error', failure } }])))
      await h.listeners[0](h.payload({ failure }), async () => undefined)
      const items = (await requestDetails(h)).items
      assert.equal(items.length, Math.min(index, 8))
      assert.equal(items.at(-1).failure.message, failure.message)
      if (index === 8) assert.deepEqual(items.map(item => item.failureIndex), [1, 2, 3, 4, 5, 6, 7, 8])
      if (index === 9) assert.deepEqual(items.map(item => item.failureIndex), [2, 3, 4, 5, 6, 7, 8, 9])
    }
  } finally { await disposeHarness(h) }
})

test('hard-denied compaction failures pass through one complete attempt without retry', async () => {
  const h = harness({ compactionRetries: 3, initialDelayMs: 0 })
  const failure = [{ type: 'finish', reason: { kind: 'error', failure: { code: 'AUTH', message: '401 invalid api key' } } }]
  const { runtime, stats } = runtimeHarness(h, () => streamOf(failure), [(options, next) => next()])
  assert.deepEqual(await collect(runtime.stream({ ...COMPACTION_OPTIONS })), failure)
  assert.equal(stats.adapterCalls, 1)
  assert.deepEqual(stats.middlewareCalls, [1])
  await disposeHarness(h)
})

test('compaction retry budget bounds fresh dispatches independently of middleware count', async () => {
  const h = harness({ compactionRetries: 1, initialDelayMs: 0 })
  const { runtime, stats } = runtimeHarness(h, () => streamOf(SERVER_FAILURE), [(options, next) => next()])
  assert.deepEqual(await collect(runtime.stream({ ...COMPACTION_OPTIONS })), SERVER_FAILURE)
  assert.equal(stats.adapterCalls, 2)
  assert.deepEqual(stats.middlewareCalls, [2])
  await disposeHarness(h)
})

test('without a redispatch runtime compaction delegates exactly once rather than reusing next', async () => {
  const h = harness({ compactionRetries: 3, initialDelayMs: 0 })
  let calls = 0
  const next = () => { calls++; return streamOf(SERVER_FAILURE) }
  assert.deepEqual(await collect(h.streamListeners[0].call({}, { ...COMPACTION_OPTIONS }, next)), SERVER_FAILURE)
  assert.equal(calls, 1)
  assert.deepEqual((await compactionRecords(h)).records, [])
  await disposeHarness(h)
})

test('caller cancellation during compaction backoff prevents the next billed request', async () => {
  const h = harness({ compactionRetries: 2, initialDelayMs: 60000, jitterRatio: 0 })
  const caller = new AbortController()
  const { runtime, stats } = runtimeHarness(h, () => streamOf(SERVER_FAILURE))
  const pending = collect(runtime.stream({ ...COMPACTION_OPTIONS, signal: caller.signal }))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(stats.adapterCalls, 1)
  const abort = new Error('caller cancelled compaction')
  caller.abort(abort)
  await assert.rejects(pending, (error) => error === abort)
  assert.equal(stats.adapterCalls, 1)
  assert.equal((await compactionRecords(h)).records[0].status, 'aborted')
  await disposeHarness(h)
})

test('plugin unload during caller-owned compaction backoff aborts and drains before another request', async () => {
  const h = harness({ compactionRetries: 2, initialDelayMs: 60000, jitterRatio: 0 })
  const caller = new AbortController()
  const { runtime, stats } = runtimeHarness(h, () => streamOf(SERVER_FAILURE))
  const pending = collect(runtime.stream({ ...COMPACTION_OPTIONS, signal: caller.signal }))
  const rejected = assert.rejects(pending, /disposed|abort/i)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(stats.adapterCalls, 1)
  const lifetime = h.disposers.find((entry) => entry.label.includes('abort and drain'))
  await lifetime.dispose()
  await rejected
  assert.equal(caller.signal.aborted, false, 'plugin owns its signal, not the caller controller')
  assert.equal(stats.adapterCalls, 1, 'no extra charged request after unload')
  assert.equal((await compactionRecords(h)).records[0].status, 'aborted')
  await disposeHarness(h)
})

test('compaction capture is bound at failure and cannot change after unrelated later traffic', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('', { status: 502 })
  const h = harness({ captureDetails: true, compactionRetries: 0 })
  try {
    const { runtime } = runtimeHarness(h, () => (async function * () {
      await globalThis.fetch('https://compaction.example/v1/chat')
      yield * SERVER_FAILURE
    })())
    await collect(runtime.stream({ ...COMPACTION_OPTIONS }))
    const before = (await compactionRecords(h)).records[0].attempts[0]
    assert.equal(before.detail.host, 'compaction.example')
    assert.equal(before.provenance, 'request-context')
    assert.ok(before.attemptId)
    await globalThis.fetch('https://later-unrelated.example/v1/chat')
    const after = (await compactionRecords(h)).records[0].attempts[0]
    assert.equal(after.detail.id, before.detail.id)
    assert.equal(after.detail.host, before.detail.host)
    assert.equal(after.attemptId, before.attemptId)
  } finally { await disposeHarness(h); globalThis.fetch = originalFetch }
})

test('compaction HTTP and network failures retain scoped capture when iterator throws the original error', async () => {
  const originalFetch = globalThis.fetch
  try {
    for (const kind of ['response', 'network']) {
      const networkError = Object.assign(new Error('synthetic socket failed'), { code: 'ECONNRESET' })
      const thrown = kind === 'network' ? networkError : Object.assign(new Error('adapter failed after HTTP response'), { code: 'STREAM_CLOSED' })
      globalThis.fetch = async () => {
        if (kind === 'network') throw networkError
        return new Response('synthetic upstream body', { status: 502, headers: { 'x-request-id': 'throw-http-request' } })
      }
      const h = harness({ captureDetails: true, compactionRetries: 3, initialDelayMs: 0 })
      try {
        const { runtime, stats } = runtimeHarness(h, () => (async function * () {
          const response = await fetch(`https://${kind}.example/v1/chat`)
          await response.text()
          throw thrown
        })())
        await assert.rejects(collect(runtime.stream({ ...COMPACTION_OPTIONS })), error => error === thrown)
        const body = await compactionRecords(h)
        const record = body.records[0]
        const attempt = record.attempts[0]
        assert.equal(record.status, 'thrown')
        assert.equal(record.attempts.length, 1)
        assert.equal(stats.adapterCalls, 1, 'throw handling does not introduce retries')
        assert.equal(body.capture.records, 1)
        assert.equal(attempt.provenance, 'request-context')
        assert.ok(attempt.attemptId)
        assert.equal(attempt.detail.context.attemptId, attempt.attemptId)
        assert.equal(attempt.detail.context.sessionId, COMPACTION_OPTIONS.sessionId)
        assert.equal(attempt.detail.host, `${kind}.example`)
        assert.equal(attempt.thrown.message, thrown.message)
        if (kind === 'response') {
          assert.equal(attempt.detail.status, 502)
          assert.equal(attempt.detail.headers['x-request-id'], 'throw-http-request')
        } else assert.equal(attempt.detail.error.code, 'ECONNRESET')
      } finally { await disposeHarness(h) }
    }
  } finally { globalThis.fetch = originalFetch }
})

test('synchronous compaction dispatch throws retain identity without borrowing an earlier capture', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('old capture', { status: 502 })
  const h = harness({ captureDetails: true, compactionRetries: 3 })
  try {
    await fetch('https://unrelated.example/v1/chat')
    const thrown = new Error('synchronous adapter refused dispatch')
    const { runtime, stats } = runtimeHarness(h, () => { throw thrown })
    await assert.rejects(collect(runtime.stream({ ...COMPACTION_OPTIONS })), error => error === thrown)
    const body = await compactionRecords(h)
    const attempt = body.records[0].attempts[0]
    assert.equal(stats.adapterCalls, 1)
    assert.equal(body.capture.records, 1)
    assert.equal(body.records[0].status, 'thrown')
    assert.ok(attempt.attemptId, 'identity is assigned before the dispatch can throw')
    assert.equal(attempt.provenance, 'request-context')
    assert.equal(attempt.detail, undefined)
    assert.equal(attempt.finishReason, undefined)
    assert.equal(attempt.thrown.message, thrown.message)
  } finally { await disposeHarness(h); globalThis.fetch = originalFetch }
})

test('concurrent thrown compactions keep evidence inside their own session and attempt', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => new Response(String(url), { status: 502 })
  const h = harness({ captureDetails: true, compactionRetries: 0 })
  try {
    const waiting = new Map()
    const errors = { 'session-A': new Error('throw A'), 'session-B': new Error('throw B') }
    const { runtime } = runtimeHarness(h, (options) => (async function * () {
      await fetch(`https://${options.sessionId.toLowerCase()}.example/v1/chat`)
      await new Promise(resolve => waiting.set(options.sessionId, resolve))
      throw errors[options.sessionId]
    })())
    const rejected = Object.fromEntries(Object.keys(errors).map(sessionId => [sessionId,
      assert.rejects(collect(runtime.stream({ ...COMPACTION_OPTIONS, sessionId })), error => error === errors[sessionId])]))
    for (let pass = 0; pass < 50 && waiting.size < 2; pass++) await new Promise(resolve => setImmediate(resolve))
    assert.equal(waiting.size, 2)
    waiting.get('session-B')()
    await rejected['session-B']
    waiting.get('session-A')()
    await rejected['session-A']
    const a = (await compactionRecords(h, 'session-A')).records[0].attempts[0]
    const b = (await compactionRecords(h, 'session-B')).records[0].attempts[0]
    assert.notEqual(a.attemptId, b.attemptId)
    for (const [attempt, sessionId] of [[a, 'session-A'], [b, 'session-B']]) {
      assert.equal(attempt.detail.context.sessionId, sessionId)
      assert.equal(attempt.detail.context.attemptId, attempt.attemptId)
      assert.equal(attempt.detail.host, `${sessionId.toLowerCase()}.example`)
    }
  } finally { await disposeHarness(h); globalThis.fetch = originalFetch }
})

test('caller cancellation during compaction preserves original thrown identity and starts no retry', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('failed before cancellation', { status: 502 })
  const h = harness({ captureDetails: true, compactionRetries: 3 })
  const caller = new AbortController()
  const abort = Object.assign(new Error('caller cancelled inside adapter'), { code: 'ABORTED' })
  try {
    const { runtime, stats } = runtimeHarness(h, () => (async function * () {
      await fetch('https://cancelled.example/v1/chat')
      caller.abort(abort)
      throw abort
    })())
    await assert.rejects(collect(runtime.stream({ ...COMPACTION_OPTIONS, signal: caller.signal })), error => error === abort)
    const record = (await compactionRecords(h)).records[0]
    assert.equal(record.status, 'aborted')
    assert.equal(record.attempts[0].thrown.code, 'ABORTED')
    assert.equal(record.attempts[0].detail.host, 'cancelled.example')
    assert.equal(stats.adapterCalls, 1)
  } finally { await disposeHarness(h); globalThis.fetch = originalFetch }
})

test('compaction terminal finish kind is exposed and max-tokens is never recorded as ok', async () => {
  const h = harness({ compactionRetries: 3 })
  try {
    for (const [kind, expected] of [['stop', 'ok'], ['tool-calls', 'ok'], ['max-tokens', 'max-tokens'], ['aborted', 'aborted'], ['unexpected-kind', 'incomplete']]) {
      const chunks = [{ type: 'finish', reason: { kind } }]
      const { runtime, stats } = runtimeHarness(h, () => streamOf(chunks))
      assert.deepEqual(await collect(runtime.stream({ ...COMPACTION_OPTIONS })), chunks)
      const record = (await compactionRecords(h)).records.at(-1)
      assert.equal(record.status, expected, kind)
      assert.equal(record.attempts[0].finishReason, kind)
      assert.ok(record.attempts[0].attemptId)
      assert.equal(record.attempts[0].detail, undefined)
      assert.equal(stats.adapterCalls, 1, 'terminal-state recording does not change retry policy')
    }
  } finally { await disposeHarness(h) }
})

test('successful compaction attempts never inherit a neighboring failure capture', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('', { status: 502 })
  const h = harness({ captureDetails: true })
  try {
    await globalThis.fetch('https://unrelated.example/v1/chat')
    const { runtime } = runtimeHarness(h, () => streamOf(STOP))
    await collect(runtime.stream({ ...COMPACTION_OPTIONS }))
    const record = (await compactionRecords(h)).records[0]
    assert.equal(record.status, 'ok')
    assert.equal(record.attempts[0].detail, undefined)
  } finally { await disposeHarness(h); globalThis.fetch = originalFetch }
})

test('compaction EOF without a finish chunk is incomplete, never successful', async () => {
  const h = harness({ compactionRetries: 2 })
  const partial = [{ type: 'text-delta', index: 0, text: 'unfinished summary' }]
  const { runtime, stats } = runtimeHarness(h, () => streamOf(partial))
  assert.deepEqual(await collect(runtime.stream({ ...COMPACTION_OPTIONS })), partial)
  assert.equal(stats.adapterCalls, 1)
  assert.equal((await compactionRecords(h)).records[0].status, 'incomplete')
  await disposeHarness(h)
})

test('non-compaction streams preserve chunks and never create compaction records', async () => {
  const h = harness({ compactionRetries: 2 })
  let calls = 0
  const direct = h.streamListeners[0].call({}, { ...COMPACTION_OPTIONS, purpose: 'session-title' }, () => { calls++; return streamOf(STOP) })
  assert.deepEqual(await collect(direct), STOP)
  assert.equal(calls, 1)
  assert.deepEqual((await compactionRecords(h)).records, [])
  await disposeHarness(h)
})

test('the compaction evidence route rejects a nonsense session id', async () => {
  const { routes } = harness({})
  const route = routes.find((entry) => entry.path === '/api/better-tips/compaction')
  const response = await route.fetch(new Request('http://localhost/api/better-tips/compaction?sessionId=%20%2F'))
  assert.equal(response.status, 400)
})

// Diagnostic routes must never become a second, unprotected copy of provider
// failure text. These drive the installed route callbacks, not helper snapshots.
const PRIVATE_KEY = 'sk-hosttestCredential123456789'
const PRIVATE_BEARER = 'Bearer hosttestCredential987654321'
function assertNoCredential (body) {
  const serialized = JSON.stringify(body)
  assert.equal(serialized.includes(PRIVATE_KEY), false)
  assert.equal(serialized.includes('hosttestCredential987654321'), false)
}

test('details route redacts failure message/code and every nested recorder string without changing original events', async () => {
  const originalFetch = globalThis.fetch
  const native = Object.assign(new Error(`socket ${PRIVATE_KEY} ${PRIVATE_BEARER}`), {
    code: `ERR_${PRIVATE_KEY}`, errno: PRIVATE_KEY, syscall: PRIVATE_BEARER, address: PRIVATE_KEY,
    cause: Object.assign(new Error(PRIVATE_BEARER), { code: PRIVATE_KEY }),
  })
  globalThis.fetch = async () => { throw native }
  const h = harness({ captureDetails: true, extraRetries: 1, initialDelayMs: 0, jitterRatio: 0,
    retryCodes: ['PI_AI_ERROR'] })
  try {
    const failure = Object.freeze({ code: 'PI_AI_ERROR', message: `provider ${PRIVATE_KEY} ${PRIVATE_BEARER}` })
    await driveRequestFailure(h, failure)
    const body = await requestDetails(h)
    assertNoCredential(body)
    const item = body.items[0]
    assert.equal(item.failure.code, 'PI_AI_ERROR')
    assert.match(item.failure.message, /sk-\[redacted\].*Bearer \[redacted\]/)
    assert.equal(item.provenance, 'request-context')
    assert.ok(Number.isFinite(item.failureTime))
    assert.equal(item.context.sessionId, 'session-1')
    assert.equal(item.context.provider, 'dingdongji')
    assert.equal(item.context.attemptId, item.attemptId)
    assert.equal(item.detail.context.attemptId, item.attemptId)
    assert.equal(item.detail.error.errno, 'sk-[redacted]')
    assert.equal(item.detail.error.syscall, 'Bearer [redacted]')
    assert.equal(item.detail.error.address, 'sk-[redacted]')
    assert.equal(item.detail.error.cause.code, 'sk-[redacted]')
    assert.equal(failure.message, `provider ${PRIVATE_KEY} ${PRIVATE_BEARER}`)
    assert.equal(h.events.find(event => event.type === 'llm/retry').data.failure, failure)
    assert.equal(native.syscall, PRIVATE_BEARER)
  } finally { await disposeHarness(h); globalThis.fetch = originalFetch }
})

test('details route redacts arbitrary failure codes and drops credential-shaped identity rather than replacing it', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('unrelated body', { status: 502 })
  const h = harness({ captureDetails: true, extraRetries: 0 })
  try {
    const provider = `provider-${PRIVATE_KEY}`
    await driveRequestFailure(h, { code: PRIVATE_BEARER, message: PRIVATE_KEY }, { provider })
    const body = await requestDetails(h)
    assertNoCredential(body)
    const item = body.items[0]
    assert.equal(item.failure.code, 'Bearer [redacted]')
    assert.equal(item.provider, undefined)
    assert.equal(item.context.provider, undefined)
    assert.equal(item.detail.context.provider, undefined)
    assert.equal(item.context.sessionId, 'session-1')
    assert.equal(item.context.attemptId, item.attemptId)
    assert.ok(Number.isFinite(item.failureTime))
  } finally { await disposeHarness(h); globalThis.fetch = originalFetch }
})

test('AUTH details withhold arbitrary provider message and body but retain status and exact request identity', async () => {
  const originalFetch = globalThis.fetch
  const unrecognized = 'vendorCredentialWithoutRecognizedShape'
  globalThis.fetch = async () => new Response(`${unrecognized} ${PRIVATE_KEY} ${PRIVATE_BEARER}`, {
    status: 401, statusText: unrecognized,
    headers: { 'x-request-id': 'request-123', server: 'gateway', 'cf-ray': PRIVATE_KEY },
  })
  const h = harness({ captureDetails: true, extraRetries: 0 })
  try {
    const failure = Object.freeze({ code: 'AUTH', message: `${unrecognized} ${PRIVATE_KEY} ${PRIVATE_BEARER}` })
    await driveRequestFailure(h, failure, { consumeBody: true, cloneFailure: true })
    const body = await requestDetails(h)
    assertNoCredential(body)
    assert.equal(JSON.stringify(body).includes(unrecognized), false)
    const item = body.items[0]
    assert.deepEqual(item.failure, { message: '', code: 'AUTH', protected: true })
    assert.equal(item.detail.status, 401)
    assert.equal(item.detail.headers['x-request-id'], 'request-123')
    assert.equal(item.detail.headers.server, 'gateway')
    assert.equal(item.detail.body, undefined)
    assert.equal(item.detail.bodyState, 'skipped')
    assert.equal(item.detail.bodyReason, 'credential-protection')
    assert.equal(item.detail.protected, true)
    assert.equal(item.detail.error, undefined)
    assert.equal(item.context.provider, 'dingdongji')
    assert.equal(item.context.attemptId, item.attemptId)
    assert.equal(item.detail.context.attemptId, item.attemptId)
    assert.ok(Number.isFinite(item.failureTime))
    assert.equal(failure.message.includes(unrecognized), true)
  } finally { await disposeHarness(h); globalThis.fetch = originalFetch }
})

test('compaction route redacts failures, record/usage text and thrown schema including nested non-message fields', async () => {
  const h = harness({ compactionRetries: 0 })
  try {
    const failure = Object.freeze({ code: PRIVATE_KEY, message: PRIVATE_BEARER })
    const { runtime } = runtimeHarness(h, () => streamOf([
      { type: 'finish', reason: { kind: 'error', failure } },
    ]))
    const chunks = await collect(runtime.stream({ ...COMPACTION_OPTIONS, model: `model-${PRIVATE_KEY}` }))
    assert.equal(chunks[0].reason.failure, failure, 'stream evidence is not mutated')
    const thrown = Object.assign(new Error(PRIVATE_KEY), { code: 'UND_ERR_SOCKET', errno: PRIVATE_KEY,
      syscall: PRIVATE_BEARER, address: PRIVATE_KEY, port: 443,
      cause: Object.assign(new Error(PRIVATE_BEARER), { code: PRIVATE_KEY }) })
    const { runtime: throwing } = runtimeHarness(h, () => (async function * () { throw thrown })())
    await assert.rejects(collect(throwing.stream({ ...COMPACTION_OPTIONS })), error => error === thrown)
    const body = await compactionRecords(h)
    assertNoCredential(body)
    assert.equal(body.records[0].model, undefined, 'suspect model identity is omitted')
    assert.equal(body.records[0].attempts[0].failure.code, 'sk-[redacted]')
    assert.equal(body.records[0].attempts[0].failure.message, 'Bearer [redacted]')
    const value = body.records[1].attempts[0].thrown
    assert.equal(value.name, 'Error')
    assert.equal(value.message, 'sk-[redacted]')
    assert.equal(value.code, 'UND_ERR_SOCKET')
    assert.equal(value.port, 443)
    assert.equal(value.errno, 'sk-[redacted]')
    assert.equal(value.syscall, 'Bearer [redacted]')
    assert.equal(value.cause.code, 'sk-[redacted]')
    assert.equal(value.cause.message, 'Bearer [redacted]')
    assert.equal(thrown.errno, PRIVATE_KEY)
  } finally { await disposeHarness(h) }
})

test('AUTH compaction route suppresses credential echoes in both failure and correlated raw body', async () => {
  const originalFetch = globalThis.fetch
  const unrecognized = 'vendorCredentialWithoutRecognizedShape'
  globalThis.fetch = async () => new Response(`${unrecognized} ${PRIVATE_KEY} ${PRIVATE_BEARER}`, {
    status: 401, headers: { 'x-request-id': 'compaction-request-1' },
  })
  const h = harness({ captureDetails: true, compactionRetries: 0 })
  try {
    const failure = Object.freeze({ code: 'AUTH', message: unrecognized, status: 401 })
    const { runtime } = runtimeHarness(h, () => (async function * () {
      await (await globalThis.fetch('https://auth.example/v1/chat')).text()
      yield { type: 'finish', reason: { kind: 'error', failure } }
    })())
    await collect(runtime.stream({ ...COMPACTION_OPTIONS }))
    const body = await compactionRecords(h)
    assertNoCredential(body)
    assert.equal(JSON.stringify(body).includes(unrecognized), false)
    const attempt = body.records[0].attempts[0]
    assert.deepEqual(attempt.failure, { message: '', code: 'AUTH', status: 401, protected: true })
    assert.equal(attempt.detail.bodyState, 'skipped')
    assert.equal(attempt.detail.bodyReason, 'credential-protection')
    assert.equal(attempt.detail.headers['x-request-id'], 'compaction-request-1')
    assert.equal(attempt.detail.context.attemptId, attempt.attemptId)
    assert.equal(attempt.provenance, 'request-context')
  } finally { await disposeHarness(h); globalThis.fetch = originalFetch }
})

test('AUTH thrown compactions protect arbitrary text and body through cause and aggregate errors', async () => {
  const originalFetch = globalThis.fetch
  const unrecognized = 'arbitraryVendorCredentialWithoutKnownShape'
  try {
    for (const wrapped of ['direct', 'cause', 'aggregate']) {
      globalThis.fetch = async () => new Response(`${unrecognized} ${PRIVATE_KEY} ${PRIVATE_BEARER}`, {
        status: 401, statusText: unrecognized, headers: { 'x-request-id': 'auth-throw-request', 'cf-ray': PRIVATE_KEY },
      })
      const auth = Object.assign(new Error(unrecognized), { code: 'AUTH', errno: unrecognized })
      const thrown = wrapped === 'cause' ? Object.assign(new Error(unrecognized), { code: 'WRAPPER', cause: auth })
        : wrapped === 'aggregate' ? new AggregateError([new Error('unrelated'), new AggregateError([auth], unrecognized)], unrecognized) : auth
      if (wrapped === 'aggregate') thrown.errors.unshift(thrown)
      const h = harness({ captureDetails: true, compactionRetries: 0 })
      try {
        const { runtime } = runtimeHarness(h, () => (async function * () {
          await (await fetch('https://auth-throw.example/v1/chat')).text()
          throw thrown
        })())
        await assert.rejects(collect(runtime.stream({ ...COMPACTION_OPTIONS })), error => error === thrown)
        const body = await compactionRecords(h)
        assertNoCredential(body)
        assert.equal(JSON.stringify(body).includes(unrecognized), false)
        const attempt = body.records[0].attempts[0]
        assert.deepEqual(attempt.thrown, { code: 'AUTH', message: '', protected: true })
        assert.ok(attempt.attemptId)
        assert.equal(attempt.detail.context.attemptId, attempt.attemptId)
        assert.equal(attempt.detail.status, 401)
        assert.equal(attempt.detail.headers['x-request-id'], 'auth-throw-request')
        assert.equal(attempt.detail.statusText, undefined)
        assert.equal(attempt.detail.body, undefined)
        assert.equal(attempt.detail.error, undefined)
        assert.equal(attempt.detail.bodyReason, 'credential-protection')
        assert.equal(attempt.detail.protected, true)
        assert.equal(thrown.message, unrecognized, 'original thrown value is untouched')
      } finally { await disposeHarness(h) }
    }
  } finally { globalThis.fetch = originalFetch }
})

test('thrown compaction network detail redacts nested credentials without changing the source error', async () => {
  const originalFetch = globalThis.fetch
  const thrown = Object.assign(new Error(`network ${PRIVATE_KEY}`), {
    code: 'ECONNRESET', errno: PRIVATE_KEY, syscall: PRIVATE_BEARER, address: PRIVATE_KEY,
    cause: Object.assign(new Error(PRIVATE_BEARER), { code: `ERR_${PRIVATE_KEY}` }),
  })
  globalThis.fetch = async () => { throw thrown }
  const h = harness({ captureDetails: true, compactionRetries: 0 })
  try {
    const { runtime } = runtimeHarness(h, () => (async function * () { await fetch('https://nested-throw.example/v1/chat') })())
    await assert.rejects(collect(runtime.stream({ ...COMPACTION_OPTIONS })), error => error === thrown)
    const body = await compactionRecords(h)
    assertNoCredential(body)
    const attempt = body.records[0].attempts[0]
    assert.equal(attempt.detail.error.errno, 'sk-[redacted]')
    assert.equal(attempt.detail.error.syscall, 'Bearer [redacted]')
    assert.equal(attempt.detail.error.address, 'sk-[redacted]')
    assert.equal(attempt.detail.error.cause.message, 'Bearer [redacted]')
    assert.equal(attempt.detail.error.cause.code, 'ERR_sk-[redacted]')
    assert.equal(attempt.thrown.errno, 'sk-[redacted]')
    assert.equal(thrown.errno, PRIVATE_KEY)
    assert.equal(thrown.cause.message, PRIVATE_BEARER)
  } finally { await disposeHarness(h); globalThis.fetch = originalFetch }
})

test('metadata error responses redact native exception text and never export AUTH durable event text', async () => {
  const failure = Object.freeze({ code: 'AUTH', message: `unrecognized-provider-credential ${PRIVATE_KEY} ${PRIVATE_BEARER}` })
  const event = Object.freeze({ seq: 7, type: 'llm/retry', data: Object.freeze({ failure }) })
  for (const throws of [false, true]) {
    let closed = 0
    const h = harness({}, { services: { sessionPersistence: { async open () {
      if (throws) throw new Error(`cannot open ${PRIVATE_KEY} ${PRIVATE_BEARER}`)
      return { async read () { return { events: [event] } }, async close () { closed++ } }
    } } } })
    try {
      const route = h.routes.find(r => r.path.endsWith('/log-metadata'))
      const response = await route.fetch(new Request('http://localhost/api/better-tips/log-metadata?sessionId=session-1&seq=7'))
      assert.equal(response.status, throws ? 500 : 200)
      const body = await response.json()
      assertNoCredential(body)
      assert.equal(JSON.stringify(body).includes('unrecognized-provider-credential'), false)
      if (throws) assert.match(body.error, /sk-\[redacted\].*Bearer \[redacted\]/)
      else { assert.equal(body.log.seq, 7); assert.equal(closed, 1) }
      assert.equal(event.data.failure, failure)
      assert.equal(failure.message.includes(PRIVATE_KEY), true)
    } finally { await disposeHarness(h) }
  }
})

test('compaction usage preserves JSON shape while sanitizing nested text and keys', async () => {
  const h = harness({ compactionRetries: 0 })
  try {
    const usage = Object.freeze({ inputTokens: 7, outputTokens: 3,
      vendor: [PRIVATE_KEY, { text: PRIVATE_BEARER, [`echo_${PRIVATE_KEY}`]: PRIVATE_KEY }] })
    const { runtime } = runtimeHarness(h, () => streamOf([
      { type: 'usage', usage }, { type: 'finish', reason: { kind: 'stop' } },
    ]))
    const seen = await collect(runtime.stream({ ...COMPACTION_OPTIONS }))
    assert.equal(seen[0].usage, usage)
    const { records } = await compactionRecords(h)
    assertNoCredential(records)
    assert.deepEqual(records[0].usage, { inputTokens: 7, outputTokens: 3,
      vendor: ['sk-[redacted]', { text: 'Bearer [redacted]', 'echo_sk-[redacted]': 'sk-[redacted]' }] })
    assert.equal(usage.vendor[0], PRIVATE_KEY)
  } finally { await disposeHarness(h) }
})
