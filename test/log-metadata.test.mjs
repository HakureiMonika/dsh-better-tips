import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import {
  errorMessageOf,
  matchErrorSources,
  readLogMetadata,
  resolveLogFile,
} from '../lib/log-metadata.js'

/** Every artifact is test-owned; no runtime sessions or installed sources are changed. */
async function fixture (t) {
  const root = await fs.mkdtemp(join(tmpdir(), 'better-tips-log-metadata-test-'))
  t.after(async () => {
    const target = resolve(root)
    assert.equal(target.startsWith(`${resolve(tmpdir())}${sep}`), true)
    assert.equal(basename(target).startsWith('better-tips-log-metadata-test-'), true)
    await fs.rm(target, { recursive: true, force: true })
  })
  const put = async (relative, content = '') => {
    const path = join(root, relative)
    await fs.mkdir(join(path, '..'), { recursive: true })
    await fs.writeFile(path, content, 'utf8')
    return path
  }
  return { root, put }
}

const streamMessage = 'Stream ended without finish_reason'
const producerSource = [
  '// fixture deliberately shifts the original installed line numbers',
  '',
  'export const stream = (model, context, options) => {',
  '  return async function* () {',
  '    const finishReason = undefined;',
  '    if (!finishReason) {',
  '      throw new Error("Stream ended without finish_reason");',
  '    }',
  '  };',
  '};',
].join('\n')
const classifierSource = [
  '// fixture classifier',
  '',
  'function classifyPiAiError(error) {',
  '  const message = error.message;',
  '  if (/stream ended (?:before|without)\\b/i.test(message)) return "TRANSPORT";',
  '}',
].join('\n')
const toolsSource = [
  'class ReflectService {',
  '  handler = {',
  '    get(target, prop) {',
  '      const error = new Error();',
  '      error.message = `cannot get required service "${prop}" in inactive context`;',
  '      throw error;',
  '    }',
  '  };',
  '}',
].join('\n')
const lineOf = (source, needle) => source.slice(0, source.indexOf(needle)).split('\n').length

async function sourceFixture (t, { producer = producerSource, classifier = classifierSource, tools = toolsSource } = {}) {
  const files = await fixture(t)
  const packages = new Map()
  const paths = {}
  for (const [name, relative, source, key] of [
    ['@earendil-works/pi-ai', 'pi-ai/dist/api/openai-completions.js', producer, 'producer'],
    ['@deepseek-ai/dsh-llm-pi-ai', 'dsh-pi-ai/lib/index.js', classifier, 'classifier'],
    ['@deepseek-ai/cordis', 'cordis/lib/index.js', tools, 'tools'],
  ]) {
    if (source === null) continue
    paths[key] = await files.put(relative, source)
    packages.set(name, join(files.root, relative.split('/')[0]))
  }
  const calls = []
  return { ...files, paths, calls, resolvePackage: async (name) => { calls.push(name); return packages.get(name) } }
}

test('physical log locator selects the highest canonical numeric generation, not mtime or lexicographic name', async (t) => {
  const f = await fixture(t)
  const prefix = 'workspace/session-a/'
  const chosen = await f.put(`${prefix}session.v12.jsonl.zstd`)
  for (const file of ['session.jsonl.zstd', 'session.v2.jsonl.zstd', 'session.v9.jsonl.zstd', 'session.v12.jsonl.zstd.bak', 'session.v999.jsonl.zstd.tmp', 'session.v03.jsonl.zstd', 'session.v0.jsonl.zstd']) {
    await f.put(`${prefix}${file}`)
  }
  const actual = await resolveLogFile(f.root, 'session-a')
  assert.deepEqual(actual, { status: 'found', path: chosen, version: 12, compression: 'zstd' })
})

test('physical log locator identifies a plain canonical generation without inventing compression', async (t) => {
  const f = await fixture(t)
  const path = await f.put('workspace/session-a/session.v4.jsonl', '{"seq":81}\n')
  await f.put('workspace/session-a/session.v2.jsonl')
  assert.deepEqual(await resolveLogFile(f.root, 'session-a', fs), { status: 'found', path, version: 4, compression: 'none' })
})

test('unversioned canonical physical log is generation zero and may be compressed', async (t) => {
  const f = await fixture(t)
  const path = await f.put('workspace/session-a/session.jsonl.zstd')
  assert.deepEqual(await resolveLogFile(f.root, 'session-a'), { status: 'found', path, version: 0, compression: 'zstd' })
})

test('canonical directory encoding is exact; the locator does not add or strip a session prefix', async (t) => {
  const f = await fixture(t)
  await f.put('workspace/session-a/session.v4.jsonl.zstd')
  const encoded = await f.put('workspace/session~003Atest/session.v4.jsonl.zstd')
  assert.equal((await resolveLogFile(f.root, 'session:test')).path, encoded)
  assert.deepEqual(await resolveLogFile(f.root, 'a'), { status: 'not-found' })
})

test('absent root, session or canonical file returns an explicit unresolved status without a guessed path', async (t) => {
  const f = await fixture(t)
  await f.put('workspace/session-a/session.v4.jsonl.zstd.bak')
  await f.put('workspace/session-a/not-session.jsonl')
  await fs.mkdir(join(f.root, 'workspace', 'session-a', 'session.v10.jsonl.zstd'))
  for (const result of [
    await resolveLogFile(f.root, 'session-a'),
    await resolveLogFile(f.root, 'missing'),
    await resolveLogFile(join(f.root, 'absent'), 'session-a'),
  ]) {
    assert.equal(result.status, 'not-found')
    assert.equal(result.path, undefined)
  }
  for (const root of [undefined, '', null]) {
    const result = await resolveLogFile(root, 'session-a')
    assert.equal(result.status, 'unavailable')
    assert.equal(result.path, undefined)
  }
})

test('same logical session in two workspace buckets is ambiguous, not whichever directory appears first', async (t) => {
  const f = await fixture(t)
  await f.put('workspace-a/session-a/session.v4.jsonl.zstd')
  await f.put('workspace-b/session-a/session.v9.jsonl.zstd')
  assert.deepEqual(await resolveLogFile(f.root, 'session-a'), { status: 'ambiguous' })
})

test('conflicting plain and compressed artifacts are ambiguous instead of guessing a physical representation', async (t) => {
  const f = await fixture(t)
  await f.put('workspace/session-a/session.v4.jsonl')
  await f.put('workspace/session-a/session.v4.jsonl.zstd')
  const actual = await resolveLogFile(f.root, 'session-a')
  assert.equal(actual.status, 'ambiguous')
  assert.equal(actual.path, undefined)
})

test('filesystem failures other than missing files are not silently mislabeled as not-found', async () => {
  const error = Object.assign(new Error('fixture denied'), { code: 'EACCES' })
  await assert.rejects(resolveLogFile('/fixture-root', 'session-a', { readdir: async () => { throw error } }), (actual) => actual === error)
})

test('errorMessageOf extracts the original error field for each supported durable event', () => {
  for (const event of [
    { type: 'turn/end', data: { reason: { kind: 'error', error: { message: streamMessage } }, message: 'wrong' } },
    { type: 'llm/retry', data: { failure: { message: streamMessage }, message: 'wrong' } },
    { type: 'compaction/end', data: { error: streamMessage, message: 'wrong' } },
    { type: 'command/done', data: { text: streamMessage, message: 'wrong' } },
  ]) assert.equal(errorMessageOf(event), streamMessage)
  for (const event of [undefined, {}, { type: 'assistant/message', data: { message: streamMessage } }, { type: 'turn/end', data: {} }]) {
    assert.equal(errorMessageOf(event), '')
  }
})

test('exact stream-ending error maps verified current source literals and recomputes source line numbers', async (t) => {
  const f = await sourceFixture(t)
  const actual = await matchErrorSources(streamMessage, f.resolvePackage)
  assert.equal(actual.length, 2)
  const producer = actual.find((entry) => entry.role === 'producer')
  const classifier = actual.find((entry) => entry.role === 'classifier')
  assert.equal(producer.function, 'stream')
  assert.equal(producer.path, f.paths.producer)
  assert.equal(producer.line, lineOf(producerSource, 'throw new Error("Stream ended without finish_reason")'))
  assert.equal(classifier.function, 'classifyPiAiError')
  assert.equal(classifier.path, f.paths.classifier)
  assert.equal(classifier.line, lineOf(classifierSource, '/stream ended (?:before|without)\\b/i'))
  assert.ok(actual.every((entry) => entry.kind === 'source-match'))
  assert.ok(actual.every((entry) => !Object.hasOwn(entry, 'stack')))
})

test('source matching follows changed current source layout rather than freezing installed line 485', async (t) => {
  const shifted = `${'// moved\r\n'.repeat(17)}${producerSource.replaceAll('\n', '\r\n')}`
  const f = await sourceFixture(t, { producer: shifted, classifier: null })
  const actual = await matchErrorSources(streamMessage, f.resolvePackage, fs)
  assert.equal(actual.length, 1)
  assert.equal(actual[0].line, lineOf(shifted, 'throw new Error("Stream ended without finish_reason")'))
  assert.notEqual(actual[0].line, 485)
})

test('partial, prefixed, suffixed or case-changed error prose never fabricates source functions', async (t) => {
  const f = await sourceFixture(t)
  for (const message of [
    'Stream ended',
    `wrapper: ${streamMessage}`,
    `${streamMessage}.`,
    `${streamMessage}\nprovider detail`,
    'stream ended without finish_reason',
    'Connection error.',
    '',
  ]) assert.deepEqual(await matchErrorSources(message, f.resolvePackage), [], message)
  assert.equal(f.calls.length, 0, 'unknown messages do not even probe known source packages')
})

test('known message alone is insufficient when its current literal is absent, duplicated or lacks the verified function anchor', async (t) => {
  for (const producer of [
    producerSource.replace('Stream ended without finish_reason', 'changed provider error'),
    `${producerSource}\nthrow new Error("Stream ended without finish_reason");`,
    producerSource.replace('export const stream =', 'export const unrelated ='),
    'export const stream = () => {};\nfunction unrelated() {\n  throw new Error("Stream ended without finish_reason");\n}',
  ]) {
    const f = await sourceFixture(t, { producer, classifier: null })
    assert.deepEqual(await matchErrorSources(streamMessage, f.resolvePackage), [])
  }
})

test('missing or unreadable installed source does not invent a function or source line', async (t) => {
  const f = await sourceFixture(t, { producer: null, classifier: null })
  assert.deepEqual(await matchErrorSources(streamMessage, f.resolvePackage), [])
  assert.deepEqual(await matchErrorSources(streamMessage, async () => { throw new Error('package missing') }), [])
  assert.deepEqual(await matchErrorSources(streamMessage, async () => '/missing-package', { readFile: async () => { throw new Error('source unavailable') } }), [])
})

test('inactive-context service error maps only the verified ReflectService handler template, not a made-up tools function', async (t) => {
  const f = await sourceFixture(t)
  const actual = await matchErrorSources('cannot get required service "tools" in inactive context', f.resolvePackage)
  assert.equal(actual.length, 1)
  assert.deepEqual(actual[0], {
    kind: 'source-match', role: 'producer', function: 'ReflectService.handler.get', path: f.paths.tools,
    line: lineOf(toolsSource, 'error.message = `cannot get required service "${prop}" in inactive context`'),
    package: '@deepseek-ai/cordis',
  })
  for (const message of [
    'prefix cannot get required service "tools" in inactive context',
    'cannot get required service "tools" in inactive context suffix',
    'cannot get required service "" in inactive context',
  ]) assert.deepEqual(await matchErrorSources(message, f.resolvePackage), [])
})

test('metadata reports logical event seq independently of physical JSONL line count', async (t) => {
  const f = await sourceFixture(t)
  const path = await f.put('workspace/session-a/session.v4.jsonl', '{"header":true}\n{"seq":91}\n')
  const event = { seq: 91, type: 'llm/retry', time: 1234, data: { failure: { message: streamMessage } } }
  const metadata = await readLogMetadata({ root: f.root, sessionId: 'session-a', event, resolvePackage: f.resolvePackage, fs })
  assert.deepEqual(metadata.log, { status: 'found', path, version: 4, compression: 'none', seq: 91, logicalLocator: 'seq=91' })
  assert.equal(metadata.sourceStatus, 'source-match')
  assert.equal(metadata.sources.length, 2)
  assert.equal(Object.hasOwn(metadata.log, 'line'), false, 'logical seq is not physical line 2 or 91')
})

test('metadata preserves explicit unresolved states and an unknown error never claims source attribution', async (t) => {
  const f = await fixture(t)
  const event = { seq: 733, type: 'turn/end', data: { reason: { kind: 'error', error: { message: 'unknown native failure' } } } }
  const metadata = await readLogMetadata({ root: f.root, sessionId: 'session-a', event, resolvePackage: async () => assert.fail('unknown message must not resolve a source package') })
  assert.deepEqual(metadata, {
    log: { status: 'not-found', seq: 733, logicalLocator: 'seq=733' },
    sources: [], sourceStatus: 'unavailable',
  })
})
