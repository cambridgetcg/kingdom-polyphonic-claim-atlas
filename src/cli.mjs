#!/usr/bin/env node

import { prettyCanonicalJson, sha256Json } from './io.mjs'
import { buildAtlas, checkTriplet, semanticIssues, tripletReceipts, writeTriplet } from './atlas.mjs'
import { publicSchema } from './schema-definition.mjs'
import { schemaDocumentIssues, validateWithSchema } from './schema-validator.mjs'

const HELP = `KINGDOM Polyphonic Claim Atlas v0.1 (offline, static, synthetic)

Usage:
  kingdom-polyphonic-claim-atlas validate   validate inputs, schema, lineage and semantic boundaries
  kingdom-polyphonic-claim-atlas build      deterministically write only the public triplet
  kingdom-polyphonic-claim-atlas check      prove the checked-in triplet matches the deterministic build
  kingdom-polyphonic-claim-atlas overview   print a bounded non-verdict fixture summary
  kingdom-polyphonic-claim-atlas help       print this help
`

function output(value) {
  process.stdout.write(prettyCanonicalJson(value))
}

function requireNoArguments(rest) {
  if (rest.length !== 0) throw new Error(`unexpected argument(s): ${rest.join(' ')}`)
}

function main() {
  const [command = 'help', ...rest] = process.argv.slice(2)
  if (['help', '--help', '-h'].includes(command)) {
    requireNoArguments(rest)
    process.stdout.write(HELP)
    return
  }
  requireNoArguments(rest)

  if (command === 'validate') {
    const atlas = buildAtlas()
    const structural = validateWithSchema(atlas, publicSchema)
    const semantic = semanticIssues(atlas)
    const schema = schemaDocumentIssues(publicSchema)
    if ([...structural, ...semantic, ...schema].length > 0) throw new Error('validation unexpectedly returned issues')
    output({
      state: 'VALID_STATIC_SYNTHETIC_TRUTH_RELATIONS',
      protocol: atlas.protocol,
      artifactId: atlas.artifact.id,
      asOf: atlas.artifact.asOf,
      counts: atlas.counts,
      atlasCanonicalReceipt: sha256Json(atlas),
      schemaIssues: 0,
      structuralIssues: 0,
      semanticIssues: 0,
      truthOracle: false,
      scores: false,
      actionAuthority: false,
      networkUsed: false,
    })
    return
  }

  if (command === 'build') {
    const receipts = writeTriplet()
    output({
      state: 'BUILT_STATIC_SYNTHETIC_PUBLIC_TRIPLET',
      protocol: 'kingdom.truth-relations/0.1',
      receipts,
      filesWritten: 3,
      externalPublication: false,
      networkUsed: false,
    })
    return
  }

  if (command === 'check') {
    const checked = checkTriplet()
    if (!checked.current) throw new Error(`public triplet is absent or differs from the deterministic build: ${checked.inventoryIssues.join('; ')}`)
    output({
      state: 'MATCHES_DETERMINISTIC_PUBLIC_TRIPLET',
      protocol: checked.atlas.protocol,
      artifactId: checked.atlas.artifact.id,
      counts: checked.atlas.counts,
      receipts: checked.receipts,
      truthOracle: false,
      actionAuthority: false,
      networkUsed: false,
    })
    return
  }

  if (command === 'overview') {
    const atlas = buildAtlas()
    output({
      title: atlas.title,
      protocol: atlas.protocol,
      artifact: atlas.artifact,
      publicHandoff: atlas.publicHandoff,
      cases: atlas.cases.map((fixture) => ({
        id: fixture.id,
        title: fixture.title,
        lesson: fixture.lesson,
        claimRegimes: [...new Set(fixture.claims.map((claim) => claim.regime))].sort(),
        assessments: fixture.assessments.length,
        synthetic: fixture.synthetic,
      })),
      counts: atlas.counts,
      publicReceipts: tripletReceipts(),
      mutableAlias: false,
      runtime: false,
      truthOracle: false,
      scores: false,
      actionAuthority: false,
      networkUsed: false,
    })
    return
  }

  throw new Error(`unknown command ${JSON.stringify(command)}\n\n${HELP}`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exitCode = 1
}
