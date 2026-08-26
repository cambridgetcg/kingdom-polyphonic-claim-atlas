import { createHash } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = fileURLToPath(new URL('../', import.meta.url))
export const CONFIG_PATH = join(ROOT, 'data', 'config.json')
export const FIXTURES_PATH = join(ROOT, 'data', 'fixtures.json')
export const GUIDE_SOURCE_PATH = join(ROOT, 'guide', 'public-guide.md')
export const ATLAS_PUBLIC_PATH = join(ROOT, 'public', 'truth', 'polyphonic-claim-atlas-2026-08-26.json')
export const SCHEMA_PUBLIC_PATH = join(ROOT, 'public', 'truth', 'schemas', 'v0.1', 'public-snapshot.schema.json')
export const GUIDE_PUBLIC_PATH = join(ROOT, 'public', 'POLYPHONIC-CLAIM-ATLAS-v0.1.md')
export const PUBLIC_FILES = Object.freeze([
  'public/POLYPHONIC-CLAIM-ATLAS-v0.1.md',
  'public/truth/polyphonic-claim-atlas-2026-08-26.json',
  'public/truth/schemas/v0.1/public-snapshot.schema.json',
])
export const MAX_JSON_BYTES = 8 * 1024 * 1024
export const MAX_TEXT_BYTES = 512 * 1024
export const JSON_LIMITS = Object.freeze({
  depth: 64,
  nodes: 200_000,
  collectionItems: 30_000,
  stringCodePoints: 65_536,
})

function assertWellFormedString(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError('unpaired high surrogate in JSON string')
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new TypeError('unpaired low surrogate in JSON string')
  }
  return value
}

function normalized(value, seen = new Set()) {
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'string') return assertWellFormedString(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite number')
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw new TypeError('unsafe JSON integer')
    return Object.is(value, -0) ? 0 : value
  }
  if (typeof value !== 'object') throw new TypeError('unsupported JSON value')
  if (seen.has(value)) throw new TypeError('cyclic JSON value')
  seen.add(value)
  try {
    if (Array.isArray(value)) return value.map((item) => normalized(item, seen))
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('JSON object must have the ordinary or null prototype')
    }
    const result = Object.create(null)
    for (const key of Object.keys(value).sort()) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new TypeError('prototype-shaped JSON key is forbidden')
      if (value[key] === undefined) throw new TypeError('undefined JSON value')
      result[key] = normalized(value[key], seen)
    }
    return result
  } finally {
    seen.delete(value)
  }
}

export function canonicalJson(value) {
  return JSON.stringify(normalized(value))
}

export function prettyCanonicalJson(value) {
  return `${JSON.stringify(normalized(value), null, 2)}\n`
}

export function sha256Bytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

export function sha256Json(value) {
  return sha256Bytes(Buffer.from(canonicalJson(value)))
}

export function insideRoot(path) {
  const rel = relative(ROOT, resolve(path))
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.includes(`${sep}..${sep}`)
}

export function assertNoSymlinkComponents(path) {
  const absolute = resolve(path)
  if (!insideRoot(absolute)) throw new RangeError('path must be a file inside the repository')
  const rootStatus = lstatSync(ROOT)
  if (rootStatus.isSymbolicLink() || !rootStatus.isDirectory()) throw new TypeError('repository root must be a real directory')
  let current = ROOT
  for (const component of relative(ROOT, absolute).split(sep)) {
    current = join(current, component)
    try {
      const status = lstatSync(current)
      if (status.isSymbolicLink()) throw new TypeError('symbolic-link path components are forbidden')
      if (current !== absolute && !status.isDirectory()) throw new TypeError('path ancestor must be a directory')
      if (current === absolute && !status.isFile()) throw new TypeError('input must be a regular file')
    } catch (error) {
      if (error?.code === 'ENOENT') break
      throw error
    }
  }
}

export function readBoundedBytes(path, maximum = MAX_JSON_BYTES) {
  const absolute = resolve(path)
  if (!insideRoot(absolute)) throw new RangeError('bundled input must remain inside the repository')
  assertNoSymlinkComponents(absolute)
  const status = statSync(absolute)
  if (!status.isFile()) throw new TypeError('input must be a regular file')
  if (status.size < 1 || status.size > maximum) throw new RangeError(`file size outside 1..${maximum} bytes`)
  return readFileSync(absolute)
}

function scanStrictJson(text, limits = JSON_LIMITS) {
  let position = 0
  let nodes = 0
  const fail = (message) => { throw new SyntaxError(`${message} at character ${position}`) }
  const whitespace = () => { while (position < text.length && /[ \t\r\n]/u.test(text[position])) position += 1 }
  const stringToken = () => {
    if (text[position] !== '"') fail('expected JSON string')
    const start = position
    position += 1
    while (position < text.length) {
      const character = text[position]
      if (character === '"') {
        position += 1
        const result = JSON.parse(text.slice(start, position))
        for (let index = 0; index < result.length; index += 1) {
          const unit = result.charCodeAt(index)
          if (unit >= 0xd800 && unit <= 0xdbff) {
            const next = result.charCodeAt(index + 1)
            if (!(next >= 0xdc00 && next <= 0xdfff)) fail('unpaired high surrogate in JSON string')
            index += 1
          } else if (unit >= 0xdc00 && unit <= 0xdfff) fail('unpaired low surrogate in JSON string')
        }
        if ([...result].length > limits.stringCodePoints) fail('JSON string exceeds code-point bound')
        return result
      }
      if (character === '\\') {
        position += 1
        if (position >= text.length) fail('unterminated JSON escape')
        if (text[position] === 'u') {
          if (!/^[0-9a-fA-F]{4}$/u.test(text.slice(position + 1, position + 5))) fail('invalid Unicode escape')
          position += 4
        } else if (!/["\\/bfnrt]/u.test(text[position])) fail('invalid JSON escape')
      } else if (character.codePointAt(0) < 0x20) fail('control character in JSON string')
      position += 1
    }
    fail('unterminated JSON string')
  }
  const value = (depth) => {
    if (depth > limits.depth) fail(`JSON nesting exceeds ${limits.depth}`)
    nodes += 1
    if (nodes > limits.nodes) fail(`JSON node count exceeds ${limits.nodes}`)
    whitespace()
    const character = text[position]
    if (character === '{') return object(depth + 1)
    if (character === '[') return array(depth + 1)
    if (character === '"') { stringToken(); return }
    for (const literal of ['true', 'false', 'null']) {
      if (text.startsWith(literal, position)) { position += literal.length; return }
    }
    const number = text.slice(position).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u)?.[0]
    if (number !== undefined) { position += number.length; return }
    fail('invalid JSON value')
  }
  const array = (depth) => {
    position += 1
    whitespace()
    if (text[position] === ']') { position += 1; return }
    let count = 0
    while (true) {
      count += 1
      if (count > limits.collectionItems) fail(`JSON array exceeds ${limits.collectionItems} items`)
      value(depth)
      whitespace()
      if (text[position] === ']') { position += 1; return }
      if (text[position] !== ',') fail('expected comma or closing bracket')
      position += 1
    }
  }
  const object = (depth) => {
    position += 1
    whitespace()
    if (text[position] === '}') { position += 1; return }
    const keys = new Set()
    while (true) {
      if (keys.size >= limits.collectionItems) fail(`JSON object exceeds ${limits.collectionItems} properties`)
      whitespace()
      const key = stringToken()
      if (keys.has(key)) fail(`duplicate JSON object key ${JSON.stringify(key)}`)
      if (['__proto__', 'prototype', 'constructor'].includes(key)) fail(`prototype-shaped JSON key ${JSON.stringify(key)} is forbidden`)
      keys.add(key)
      whitespace()
      if (text[position] !== ':') fail('expected colon')
      position += 1
      value(depth)
      whitespace()
      if (text[position] === '}') { position += 1; return }
      if (text[position] !== ',') fail('expected comma or closing brace')
      position += 1
    }
  }
  whitespace()
  value(0)
  whitespace()
  if (position !== text.length) fail('trailing data after JSON value')
}

export function parseJsonBytes(bytes, label = 'JSON', limits = JSON_LIMITS) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError(`${label} must be bytes`)
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_JSON_BYTES) throw new RangeError(`${label} byte length is outside bounds`)
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  scanStrictJson(text, limits)
  const value = JSON.parse(text)
  if (value === null || typeof value !== 'object') throw new TypeError(`${label} must contain an object or array`)
  return normalized(value)
}

export function readJson(path) {
  return parseJsonBytes(readBoundedBytes(path, MAX_JSON_BYTES), path)
}

export function readUtf8Text(path, maximum = MAX_TEXT_BYTES) {
  return new TextDecoder('utf-8', { fatal: true }).decode(readBoundedBytes(path, maximum))
}

export function writeAllBytes(descriptor, bytes, writer = writeSync) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1) throw new TypeError('output bytes must be non-empty')
  let offset = 0
  while (offset < bytes.byteLength) {
    const written = writer(descriptor, bytes, offset, bytes.byteLength - offset)
    if (!Number.isSafeInteger(written) || written < 1 || written > bytes.byteLength - offset) {
      throw new Error('output write made invalid or zero progress')
    }
    offset += written
  }
  return offset
}

function relativePublicPath(path) {
  return relative(ROOT, resolve(path)).split(sep).join('/')
}

export function atomicWriteAuthorized(path, text, operations = {}) {
  if (typeof text !== 'string' || text.length < 1) throw new TypeError('public output must be non-empty text')
  const absolute = resolve(path)
  const repositoryPath = relativePublicPath(absolute)
  if (!PUBLIC_FILES.includes(repositoryPath)) throw new RangeError(`undeclared public output path ${repositoryPath}`)
  assertNoSymlinkComponents(absolute)
  mkdirSync(dirname(absolute), { recursive: true })
  assertNoSymlinkComponents(absolute)
  const temporary = `${absolute}.${process.pid}.tmp`
  const open = operations.openSync ?? openSync
  const write = operations.writeSync ?? writeSync
  const sync = operations.fsyncSync ?? fsyncSync
  const close = operations.closeSync ?? closeSync
  const rename = operations.renameSync ?? renameSync
  const unlink = operations.unlinkSync ?? unlinkSync
  let descriptor
  let failure
  try {
    descriptor = open(temporary, 'wx', 0o600)
    writeAllBytes(descriptor, Buffer.from(text, 'utf8'), write)
    sync(descriptor)
    const completed = descriptor
    descriptor = undefined
    close(completed)
    rename(temporary, absolute)
  } catch (error) {
    failure = error
  } finally {
    if (descriptor !== undefined) {
      try { close(descriptor) } catch (error) { failure ??= error }
    }
    try { unlink(temporary) } catch (error) {
      if (error?.code !== 'ENOENT') failure ??= error
    }
  }
  if (failure !== undefined) throw failure
}

function filesBelow(path) {
  if (!existsSync(path)) return []
  const output = []
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const child = join(current, entry.name)
      const status = lstatSync(child)
      if (status.isSymbolicLink()) throw new TypeError(`symbolic link is forbidden: ${relativePublicPath(child)}`)
      if (status.isDirectory()) visit(child)
      else if (status.isFile()) output.push(relativePublicPath(child))
      else throw new TypeError(`non-regular public entry is forbidden: ${relativePublicPath(child)}`)
    }
  }
  visit(path)
  return output.sort()
}

export function publicInventoryIssues({ allowMissing = false } = {}) {
  const actual = filesBelow(join(ROOT, 'public'))
  const expected = [...PUBLIC_FILES].sort()
  const issues = []
  for (const path of actual) if (!expected.includes(path)) issues.push(`undeclared public file ${path}`)
  if (!allowMissing) for (const path of expected) if (!actual.includes(path)) issues.push(`missing public file ${path}`)
  return issues
}
