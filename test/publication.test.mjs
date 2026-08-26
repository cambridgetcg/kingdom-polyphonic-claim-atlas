import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { checkTriplet, renderedTriplet, tripletReceipts } from '../src/atlas.mjs'
import { ROOT, sha256Bytes } from '../src/io.mjs'

test('checked public files match the deterministic triplet byte for byte', () => {
  const checked = checkTriplet()
  assert.equal(checked.current, true)
  assert.deepEqual(checked.inventoryIssues, [])
  for (const receipt of Object.values(checked.receipts)) assert.equal(receipt.current, true, receipt.path)
})

test('triplet receipts independently match bytes on disk', () => {
  const receipts = tripletReceipts(renderedTriplet())
  for (const receipt of Object.values(receipts)) {
    const bytes = readFileSync(join(ROOT, receipt.path))
    assert.equal(bytes.byteLength, receipt.bytes)
    assert.equal(sha256Bytes(bytes), receipt.byteSha256)
  }
})

test('publication authorization is narrow, byte-exact and excludes any broader release', () => {
  const text = readFileSync(join(ROOT, 'PUBLICATION-AUTHORIZATION.md'), 'utf8')
  for (const path of [
    'public/truth/polyphonic-claim-atlas-2026-08-26.json',
    'public/truth/schemas/v0.1/public-snapshot.schema.json',
    'public/POLYPHONIC-CLAIM-ATLAS-v0.1.md',
  ]) assert.match(text, new RegExp(path.replaceAll('.', '\\.'), 'u'))
  assert.match(text, /External publication is authorized only for the following exact source bytes/u)
  assert.match(text, /covers no alias, page, manifest, asset, loader, runtime, API, MCP surface, feed or additional file/u)
})

test('reviewed receipt lock is separate, non-self-referential and matches the public bytes', () => {
  const lock = JSON.parse(readFileSync(join(ROOT, 'REVIEWED-RECEIPTS.json'), 'utf8'))
  const authorization = readFileSync(join(ROOT, 'PUBLICATION-AUTHORIZATION.md'), 'utf8')
  assert.equal(lock.reviewState, 'INDEPENDENT_REVIEW_COMPLETE')
  assert.equal(lock.reviewEvidence.semanticChangeAfterReview, false)
  assert.equal(lock.publicationAuthorization.state, 'AUTHORIZED_FOR_EXACT_FILES_ONLY')
  assert.equal(lock.lockBoundary.includedInPublicTriplet, false)
  assert.equal(lock.lockBoundary.receiptedByAtlas, false)
  assert.equal(lock.lockBoundary.affectsTripletBytes, false)
  assert.equal(lock.lockBoundary.selfReferentialReceipt, false)
  for (const file of lock.publicationAuthorization.files) {
    const bytes = readFileSync(join(ROOT, file.sourcePath))
    assert.equal(bytes.byteLength, file.bytes, file.sourcePath)
    assert.equal(sha256Bytes(bytes), file.byteSha256, file.sourcePath)
    assert.ok(authorization.includes(`\`${file.destinationPath}\``), file.destinationPath)
    assert.ok(authorization.includes(`| ${file.bytes} |`), String(file.bytes))
    assert.ok(authorization.includes(file.byteSha256.slice('sha256:'.length)), file.byteSha256)
  }
})
