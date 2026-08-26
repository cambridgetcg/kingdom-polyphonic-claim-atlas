import assert from 'node:assert/strict'
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  ROOT,
  atomicWriteAuthorized,
  canonicalJson,
  parseJsonBytes,
  readBoundedBytes,
  writeAllBytes,
} from '../src/io.mjs'

test('strict parser returns recursively null-prototype objects', () => {
  const value = parseJsonBytes(Buffer.from('{"outer":{"value":1},"items":[{"ok":true}]}'))
  assert.equal(Object.getPrototypeOf(value), null)
  assert.equal(Object.getPrototypeOf(value.outer), null)
  assert.equal(Object.getPrototypeOf(value.items[0]), null)
})

test('strict parser rejects duplicate decoded keys and prototype-shaped keys', () => {
  for (const text of [
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"__proto__":1}',
    '{"\\u0063onstructor":1}',
    '{"prototype":1}',
  ]) assert.throws(() => parseJsonBytes(Buffer.from(text)), /duplicate|prototype-shaped/u)
})

test('strict parser and canonicalizer reject invalid Unicode and unsafe numbers', () => {
  assert.throws(() => parseJsonBytes(Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d])), /encoded data|UTF-8|valid/u)
  for (const text of ['{"x":"\\ud800"}', '{"x":"\\udc00"}', '{"x":9007199254740993}', '{"x":1e999}']) {
    assert.throws(() => parseJsonBytes(Buffer.from(text)), /surrogate|unsafe|non-finite/u)
  }
  assert.throws(() => canonicalJson({ x: '\ud800' }), /surrogate/u)
})

test('strict parser enforces depth, node and collection limits', () => {
  assert.throws(() => parseJsonBytes(Buffer.from('{"a":{"b":1}}'), 'bounded', { depth: 1, nodes: 20, collectionItems: 20, stringCodePoints: 20 }), /nesting/u)
  assert.throws(() => parseJsonBytes(Buffer.from('[1,2]'), 'bounded', { depth: 4, nodes: 20, collectionItems: 1, stringCodePoints: 20 }), /array exceeds/u)
  assert.throws(() => parseJsonBytes(Buffer.from('{"a":1,"b":2}'), 'bounded', { depth: 4, nodes: 20, collectionItems: 1, stringCodePoints: 20 }), /object exceeds/u)
})

test('writeAllBytes handles partial progress and rejects zero progress', () => {
  const chunks = []
  const bytes = Buffer.from('abcdef')
  const count = writeAllBytes(7, bytes, (_fd, source, offset, length) => {
    const written = Math.min(2, length)
    chunks.push(source.subarray(offset, offset + written).toString())
    return written
  })
  assert.equal(count, 6)
  assert.equal(chunks.join(''), 'abcdef')
  assert.throws(() => writeAllBytes(7, bytes, () => 0), /zero progress/u)
})

test('public writer rejects every undeclared output path', () => {
  assert.throws(() => atomicWriteAuthorized(join(ROOT, 'public', 'alias.json'), '{}\n'), /undeclared public output/u)
  assert.throws(() => atomicWriteAuthorized('/tmp/escape.json', '{}\n'), /undeclared public output|inside the repository/u)
})

test('symlink path components are rejected', () => {
  const base = join(ROOT, '.test-symlink-boundary')
  rmSync(base, { recursive: true, force: true })
  mkdirSync(base)
  writeFileSync(join(base, 'target.json'), '{}')
  symlinkSync(join(base, 'target.json'), join(base, 'link.json'))
  try {
    assert.throws(() => readBoundedBytes(join(base, 'link.json')), /symbolic-link/u)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})
