import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'

import { buildAtlas, renderedTriplet } from '../src/atlas.mjs'
import { PUBLIC_FILES, ROOT, canonicalJson, parseJsonBytes, publicInventoryIssues } from '../src/io.mjs'

function filesUnder(path) {
  const output = []
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const child = join(current, entry.name)
      const repositoryRelative = relative(ROOT, child).split('\\').join('/')
      const status = lstatSync(child)
      if (status.isSymbolicLink()) throw new Error(`symbolic link is forbidden: ${relative(ROOT, child)}`)
      if (repositoryRelative === '.git') {
        if (!status.isDirectory()) throw new Error('repository-root .git must be a real directory')
        continue
      }
      if (entry.name === '.git') throw new Error(`nested Git metadata is forbidden: ${repositoryRelative}`)
      if (entry.name.startsWith('.test-')) {
        if (!status.isDirectory()) throw new Error(`non-directory test state is forbidden: ${repositoryRelative}`)
        continue
      }
      if (status.isDirectory()) visit(child)
      else if (status.isFile()) output.push(child)
      else throw new Error(`non-regular repository entry is forbidden: ${relative(ROOT, child)}`)
    }
  }
  visit(path)
  return output.sort()
}

test('build is deterministic when ambient network and time zones are hostile', () => {
  const previousFetch = globalThis.fetch
  const previousWebSocket = globalThis.WebSocket
  globalThis.fetch = () => { throw new Error('network use forbidden') }
  globalThis.WebSocket = class { constructor() { throw new Error('network use forbidden') } }
  try {
    const first = renderedTriplet()
    const second = renderedTriplet()
    assert.equal(first.atlasText, second.atlasText)
    assert.equal(first.schemaText, second.schemaText)
    assert.equal(first.guideText, second.guideText)
    assert.equal(canonicalJson(buildAtlas()), canonicalJson(first.atlas))
    assert.equal(first.atlas.buildProvenance.networkUsed, false)
    assert.equal(first.atlas.buildProvenance.clockRead, false)
  } finally {
    if (previousFetch === undefined) delete globalThis.fetch
    else globalThis.fetch = previousFetch
    if (previousWebSocket === undefined) delete globalThis.WebSocket
    else globalThis.WebSocket = previousWebSocket
  }
})

test('producer source has no network, process-launch or dynamic-code capability', () => {
  const text = filesUnder(join(ROOT, 'src')).map((path) => readFileSync(path, 'utf8')).join('\n')
  for (const pattern of [
    /node:(?:http|https|http2|net|tls|dns|dgram|child_process|cluster|worker_threads)/u,
    /\bfetch\s*\(/u,
    /\bXMLHttpRequest\b/u,
    /\bWebSocket\b/u,
    /\bEventSource\b/u,
    /\beval\s*\(/u,
    /\bnew\s+Function\b/u,
    /\b(?:spawn|execFile|execFileSync|execSync)\s*\(/u,
  ]) assert.doesNotMatch(text, pattern)
})

test('CLI exposes only bounded inspection and fixed deterministic build', () => {
  for (const command of ['validate', 'check', 'overview']) {
    const stdout = execFileSync(process.execPath, ['./src/cli.mjs', command], {
      cwd: ROOT,
      env: { ...process.env, TZ: 'Pacific/Kiritimati', LANG: 'C' },
    })
    const result = parseJsonBytes(stdout, `CLI ${command}`)
    assert.equal(result.networkUsed, false)
  }
  for (const args of [['serve'], ['run'], ['publish'], ['validate', 'extra'], ['build', '--output', '/tmp/escape']]) {
    const result = spawnSync(process.execPath, ['./src/cli.mjs', ...args], { cwd: ROOT, encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /unknown command|unexpected argument/u)
  }
})

test('public handoff inventory is exactly the immutable triplet', () => {
  assert.deepEqual(publicInventoryIssues(), [])
  const actual = filesUnder(join(ROOT, 'public')).map((path) => relative(ROOT, path).split('\\').join('/')).sort()
  assert.deepEqual(actual, [...PUBLIC_FILES].sort())
})

test('full atlas contains no personal-shaped record or real-person intake surface', () => {
  const atlas = buildAtlas()
  const text = canonicalJson(atlas)
  assert.equal(atlas.scope.realPeople, false)
  assert.equal(atlas.scope.personalData, false)
  assert.equal(atlas.scope.liveClaims, false)
  assert.doesNotMatch(text, /mailto:/iu)
  assert.doesNotMatch(text, /"(?:email|phone|postcode|accountId|userId|realPersonName|contact)"\s*:/iu)
  assert.doesNotMatch(text, /"(?:truthStatus|groundTruth|liarVerdict|globalVerdict)"\s*:/iu)
})

test('all six generator and conformance sources have exact byte receipts', () => {
  const receipts = buildAtlas().buildProvenance.textInputReceipts
  assert.deepEqual(receipts.map((receipt) => receipt.path).sort(), [
    'guide/public-guide.md',
    'src/atlas.mjs',
    'src/cli.mjs',
    'src/io.mjs',
    'src/schema-definition.mjs',
    'src/schema-validator.mjs',
  ])
  for (const receipt of receipts) {
    assert.match(receipt.byteSha256, /^sha256:[a-f0-9]{64}$/u)
    assert.ok(receipt.bytes > 0)
  }
})

test('repository contains no symlink, special file, dependency lock or nested Git metadata', () => {
  for (const path of filesUnder(ROOT)) assert.equal(lstatSync(path).isFile(), true, relative(ROOT, path))
  assert.equal(existsSync(join(ROOT, 'package-lock.json')), false)
  assert.equal(existsSync(join(ROOT, 'node_modules')), false)
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert.equal(Object.hasOwn(pkg, 'dependencies'), false)
  assert.equal(Object.hasOwn(pkg, 'devDependencies'), false)
})

test('repository inventory is explicit and contains no undeclared generated state', () => {
  const expected = [
    '.github/workflows/validate.yml',
    '.gitignore',
    'AGENTS.md',
    'NOTICE.md',
    'PUBLICATION-AUTHORIZATION.md',
    'REVIEWED-RECEIPTS.json',
    'README.md',
    'data/config.json',
    'data/fixtures.json',
    'guide/public-guide.md',
    'package.json',
    'public/POLYPHONIC-CLAIM-ATLAS-v0.1.md',
    'public/truth/polyphonic-claim-atlas-2026-08-26.json',
    'public/truth/schemas/v0.1/public-snapshot.schema.json',
    'src/atlas.mjs',
    'src/cli.mjs',
    'src/io.mjs',
    'src/schema-definition.mjs',
    'src/schema-validator.mjs',
    'test/contracts.test.mjs',
    'test/io.test.mjs',
    'test/mutations.test.mjs',
    'test/publication.test.mjs',
    'test/schema.test.mjs',
    'test/security.test.mjs',
  ].sort()
  assert.deepEqual(filesUnder(ROOT).map((path) => relative(ROOT, path).split('\\').join('/')).sort(), expected)
})
