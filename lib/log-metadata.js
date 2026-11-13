import * as nodeFs from 'node:fs/promises'
import { join } from 'node:path'

/** Physical artifacts only: never assume a cwd-derived spelling or a fixed format version. */
export async function resolveLogFile (root, sessionId, fs = nodeFs, signal) {
  signal?.throwIfAborted()
  if (typeof root !== 'string' || !root) return { status: 'unavailable' }
  const encode = (value) => value === '.' ? '~002E' : value === '..' ? '~002E~002E'
    : value.split('').map((ch) => /^[A-Za-z0-9._-]$/.test(ch) && ch !== '~' ? ch : `~${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join('')
  const matches = []
  let projects
  try { projects = await fs.readdir(root, { withFileTypes: true }) } catch (error) {
    if (error.code === 'ENOENT') return { status: 'not-found' }
    throw error
  }
  for (const project of projects) {
    signal?.throwIfAborted()
    if (!project.isDirectory()) continue
    const dir = join(root, project.name, encode(sessionId))
    let files
    try { files = await fs.readdir(dir, { withFileTypes: true }) } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    const candidates = files.filter((file) => file.isFile()).flatMap((file) => {
      const match = /^session(?:\.v([1-9]\d*))?\.jsonl(\.zstd)?$/.exec(file.name)
      return match ? [{ path: join(dir, file.name), version: Number(match[1] ?? 0), compression: match[2] ? 'zstd' : 'none' }] : []
    })
    if (!candidates.length) continue
    if (new Set(candidates.map((item) => item.compression)).size > 1) return { status: 'ambiguous' }
    matches.push(candidates.sort((a, b) => b.version - a.version)[0])
  }
  if (matches.length !== 1) return { status: matches.length ? 'ambiguous' : 'not-found' }
  return { status: 'found', ...matches[0] }
}

export function errorMessageOf (event) {
  const data = event?.data ?? {}
  return String(event?.type === 'turn/end' ? data.reason?.error?.message ?? ''
    : event?.type === 'llm/retry' ? data.failure?.message ?? ''
      : event?.type === 'compaction/end' ? data.error ?? ''
        : event?.type === 'command/done' ? data.text ?? '' : '')
}

/** Verified literal locations are source references, never claims of the actual execution stack. */
export async function matchErrorSources (message, resolvePackage, fs = nodeFs, signal) {
  signal?.throwIfAborted()
  const specs = []
  if (message === 'Stream ended without finish_reason') {
    specs.push({ package: '@earendil-works/pi-ai', file: 'dist/api/openai-completions.js', function: 'stream',
      anchor: 'export const stream =', needle: 'throw new Error("Stream ended without finish_reason")', role: 'producer' })
    specs.push({ package: '@deepseek-ai/dsh-llm-pi-ai', file: 'lib/index.js', function: 'classifyPiAiError',
      anchor: 'function classifyPiAiError(', needle: '/stream ended (?:before|without)\\b/i', role: 'classifier' })
  }
  if (/^cannot get required service "[^"\r\n]+" in inactive context$/.test(message)) {
    specs.push({ package: '@deepseek-ai/cordis', file: 'lib/index.js', function: 'ReflectService.handler.get',
      anchor: 'handler = {', needle: 'error.message = `cannot get required service "${prop}" in inactive context`', role: 'producer' })
  }
  const results = []
  for (const spec of specs) {
    try {
      const dir = await resolvePackage(spec.package)
      if (!dir) continue
      const path = join(dir, spec.file)
      signal?.throwIfAborted()
      const source = await fs.readFile(path, signal ? { encoding: 'utf8', signal } : 'utf8')
      const at = source.indexOf(spec.needle)
      const anchorAt = source.lastIndexOf(spec.anchor, at)
      if (at < 0 || source.indexOf(spec.needle, at + 1) >= 0 || anchorAt < 0) continue
      const anchorLine = source.lastIndexOf('\n', anchorAt) + 1
      const indentation = /^\s*/.exec(source.slice(anchorLine, anchorAt))[0].length
      if (/}\s*;/.test(source.slice(anchorAt, at).split('\n')[0])) continue
      const between = source.slice(anchorAt, at).split('\n').slice(1)
      if (between.some((line) => /^\s*}/.test(line) && /^\s*/.exec(line)[0].length <= indentation)) continue
      results.push({ kind: 'source-match', role: spec.role, function: spec.function, path,
        line: source.slice(0, at).split('\n').length, package: spec.package })
    } catch { signal?.throwIfAborted() /* Different builds cannot establish a match. */ }
  }
  return results
}

export async function readLogMetadata ({ root, sessionId, event, resolvePackage, fs = nodeFs, signal }) {
  const log = await resolveLogFile(root, sessionId, fs, signal)
  const sources = await matchErrorSources(errorMessageOf(event), resolvePackage, fs, signal)
  return { log: { ...log, seq: event.seq, logicalLocator: `seq=${event.seq}` }, sources,
    sourceStatus: sources.length ? 'source-match' : 'unavailable' }
}
