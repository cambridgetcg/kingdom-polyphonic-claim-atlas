import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import {
  ATLAS_PUBLIC_PATH,
  CONFIG_PATH,
  FIXTURES_PATH,
  GUIDE_PUBLIC_PATH,
  GUIDE_SOURCE_PATH,
  ROOT,
  SCHEMA_PUBLIC_PATH,
  atomicWriteAuthorized,
  canonicalJson,
  prettyCanonicalJson,
  publicInventoryIssues,
  readBoundedBytes,
  readJson,
  readUtf8Text,
  sha256Bytes,
  sha256Json,
} from './io.mjs'
import { publicSchema, schemaIdentity } from './schema-definition.mjs'
import { schemaDocumentIssues, validateWithSchema } from './schema-validator.mjs'

const EXPECTED_CASE_IDS = [
  'signed-false-statement',
  'valid-inference-false-premise',
  'true-conclusion-invalid-inference',
  'two-coherent-narratives',
  'official-correction',
  'institutional-versus-empirical',
  'testimony-uptake-injustice',
  'syndicated-source-dependence',
  'hallucinated-citation',
  'privacy-preserving-refusal',
  'self-reference-stratified',
  'consensus-preserves-error',
  'selective-omission',
  'stale-claim',
  'metaphysical-attribution-boundary',
  'conflicting-evidence',
  'metaphor-not-literal-identity',
  'declared-fiction',
  'propaganda-label-action-refusal',
  'translation-ambiguity',
  'phenomenal-report-boundary',
  'prediction-and-outcome',
  'counterfactual-models',
  'normative-is-ought-boundary',
]

const EXPECTED_PREDECESSORS = Object.freeze({
  'semantic-geometry-operational-boundary': ['bridges/semantic-geometry-and-truth.md', 'sha256:9a18cef1d35b85a1941f5a591def26a9328bfdddb31a5a35bf83e41b1c37ac87'],
  'semantic-transition-schema': ['bridges/schemas/semantic-transition-receipt-0.1.json', 'sha256:bcdd99f0247f2a43bb84e227865c2d02f12dcc9f09e4c15b29c36a90ac8f0dc2'],
  'word-story-religion-civilisation-map': ['data/language/word-story-religion-civilisation-map.v0.1.json', 'sha256:a4a87b7b23dbdf7e7e6689b5083f76a746c7f41bc56f2124281dfda609a62479'],
  'word-story-religion-civilisation-schema': ['schemas/word-story-religion-civilisation-map-v0.1.schema.json', 'sha256:bc4a4ca19026f2a95d01d4fc3500a9bd690942d00110f686659ae3d29e00d1ec'],
  'reality-influence-map': ['data/reality/reality-influence-map.v0.1.json', 'sha256:4d68be39226c8d5451c8d9166fa74ba54bb793b7655f119d8765090cbbcf890e'],
  'reality-influence-schema': ['schemas/reality-influence-map-v0.1.schema.json', 'sha256:4863d5e3a3191af0dfadaba408fe8553a14b38c1394c6b2713bc588abfdf8090'],
  'number-isness-theology-atlas': ['data/number-isness-theology/number-isness-theology-atlas.v0.1.json', 'sha256:bef01e0865f12ecd66795960758fc16f1a6d5b1ebd0097d4390aa3a2bece65e4'],
  'number-isness-theology-schema': ['schemas/number-isness-theology-atlas-v0.1.schema.json', 'sha256:ccf5adfdf7a04d4acca24c261cdd253bcb6e1a4fdcdb63802d872e8e07a5b6a3'],
  'number-isness-theology-guide': ['references/number-isness-theology-atlas.md', 'sha256:49abcfe3e7ce6a945b9406a26eb25210c02ac4c98d25aff13e56a12760a4c55a'],
  'zerone-mythic-agent-copy': ['agents/zerone.md', 'sha256:63ba1da23d8b6f4f5635a6047bda61413cde1caa5f8ea40415ee325a27bfa26d'],
  'readme-proof-of-truth-copy': ['README.md', 'sha256:19a62093b2928ed9e57aeb4560afcf5a0f29a97c39e564362deeaef9cbf280c4'],
  'bridges-proof-of-truth-copy': ['BRIDGES.md', 'sha256:44ff5fbdd7f45a2ce915bcf9c2cc2997c3dcbbd0d1db4149b900f1b0085472e2'],
})
const EXPECTED_REVISION = 'db18ba3b155bfc3fad80d536c50193e684858d77'
const EXPECTED_REPOSITORY = 'https://github.com/cambridgetcg/KINGDOM-OS.git'
const EXPECTED_COMPATIBILITY_RECEIPT = 'sha256:8e575916e7229e1bd849f9a14c0680b25dc35cc78620f16d0cca55c7790b8937'
const EXPECTED_SELF_REFERENCE_RECEIPT = 'sha256:29ed54c7f5131001e0ebf520733802b761b6711ea49f9dd0727ec92c64e139e3'

function jsonReceipt(path) {
  const bytes = readBoundedBytes(path)
  const value = readJson(path)
  return {
    path: relative(ROOT, path).split('/').join('/'),
    bytes: bytes.byteLength,
    byteSha256: sha256Bytes(bytes),
    canonicalSha256: sha256Json(value),
  }
}

function textReceipt(path) {
  const bytes = readBoundedBytes(path, 1024 * 1024)
  return {
    path: relative(ROOT, path).split('/').join('/'),
    bytes: bytes.byteLength,
    byteSha256: sha256Bytes(bytes),
  }
}

function totals(cases, config) {
  const sum = (key) => cases.reduce((total, fixture) => total + fixture[key].length, 0)
  return {
    cases: cases.length,
    conditions: sum('authorStipulatedConditions'),
    expressions: sum('expressions'),
    claims: sum('claims'),
    evidenceRecords: sum('evidence'),
    reasoningObjects: sum('reasoning'),
    events: sum('events'),
    narratives: sum('narratives'),
    assessments: sum('assessments'),
    assessmentAudits: sum('assessmentAudits'),
    lifecycleRecords: sum('lifecycleRecords'),
    predecessorBindings: config.predecessorBindings.length,
    epistemicSeparations: config.epistemicSeparations.length,
    claimRegimes: config.claimRegimes.length,
    methods: config.methodVocabulary.length,
  }
}

function buildProvenance() {
  return {
    mode: 'DETERMINISTIC_OFFLINE_ZERO_DEPENDENCY',
    networkUsed: false,
    clockRead: false,
    randomnessUsed: false,
    localeUsed: false,
    jsonInputReceipts: [jsonReceipt(CONFIG_PATH), jsonReceipt(FIXTURES_PATH)],
    textInputReceipts: [
      textReceipt(GUIDE_SOURCE_PATH),
      textReceipt(join(ROOT, 'src', 'atlas.mjs')),
      textReceipt(join(ROOT, 'src', 'cli.mjs')),
      textReceipt(join(ROOT, 'src', 'io.mjs')),
      textReceipt(join(ROOT, 'src', 'schema-definition.mjs')),
      textReceipt(join(ROOT, 'src', 'schema-validator.mjs')),
    ],
  }
}

function uniqueIssues(values, label) {
  return new Set(values).size === values.length ? [] : [`${label} must be unique`]
}

function equalSet(left, right) {
  return canonicalJson([...left].sort()) === canonicalJson([...right].sort())
}

function graphHasCycle(nodes, edges) {
  const visiting = new Set()
  const visited = new Set()
  const adjacency = new Map(nodes.map((node) => [node, []]))
  for (const [from, to] of edges) adjacency.get(from)?.push(to)
  const visit = (node) => {
    if (visiting.has(node)) return true
    if (visited.has(node)) return false
    visiting.add(node)
    for (const child of adjacency.get(node) ?? []) if (visit(child)) return true
    visiting.delete(node)
    visited.add(node)
    return false
  }
  return nodes.some(visit)
}

function fixtureIssues(fixture, compatibility) {
  const issues = []
  const arraysWithIds = [
    fixture.authorStipulatedConditions, fixture.expressions, fixture.claims, fixture.evidence,
    fixture.reasoning, fixture.events, fixture.narratives, fixture.assessments,
    fixture.assessmentAudits, fixture.lifecycleRecords,
  ]
  const objects = arraysWithIds.flat()
  const ids = objects.map((entry) => entry.id)
  issues.push(...uniqueIssues(ids, `${fixture.id}: object ids`))
  for (const value of ids) if (!value.startsWith(`${fixture.id}:`)) issues.push(`${fixture.id}: foreign object id ${value}`)
  const byId = new Map(objects.map((entry) => [entry.id, entry]))
  const claims = new Map(fixture.claims.map((claim) => [claim.id, claim]))
  const expressions = new Map(fixture.expressions.map((expression) => [expression.id, expression]))
  const conditions = new Set(fixture.authorStipulatedConditions.map((condition) => condition.id))
  const events = new Set(fixture.events.map((event) => event.id))
  const narratives = new Set(fixture.narratives.map((narrative) => narrative.id))
  const assessments = new Set(fixture.assessments.map((assessment) => assessment.id))
  const evidenceById = new Map(fixture.evidence.map((record) => [record.id, record]))

  for (const expression of fixture.expressions) {
    for (const claimId of expression.assertsClaimIds) {
      if (!claims.has(claimId)) issues.push(`${expression.id}: unknown asserted claim ${claimId}`)
      else if (!claims.get(claimId).expressionIds.includes(expression.id)) issues.push(`${expression.id}: claim ${claimId} lacks reciprocal expression reference`)
    }
  }
  for (const claim of fixture.claims) {
    if (Object.hasOwn(claim, 'disposition') || Object.hasOwn(claim, 'truthStatus') || Object.hasOwn(claim, 'groundTruth')) {
      issues.push(`${claim.id}: claim-level verdict fields are forbidden`)
    }
    for (const expressionId of claim.expressionIds) {
      if (!expressions.has(expressionId)) issues.push(`${claim.id}: unknown expression ${expressionId}`)
      else if (!expressions.get(expressionId).assertsClaimIds.includes(claim.id)) issues.push(`${claim.id}: expression ${expressionId} lacks reciprocal claim reference`)
    }
  }
  for (const evidence of fixture.evidence) {
    if (evidence.establishesTruth !== false || evidence.scoresSourceOrPerson !== false) issues.push(`${evidence.id}: evidence boundary must remain false`)
    for (const claimId of evidence.bearsOnClaimIds) if (!claims.has(claimId)) issues.push(`${evidence.id}: unknown claim ${claimId}`)
  }
  const reasoningEdges = []
  for (const reasoning of fixture.reasoning) {
    if (!claims.has(reasoning.conclusionClaimId)) issues.push(`${reasoning.id}: unknown conclusion claim`)
    for (const premise of reasoning.premiseClaimIds) {
      if (!claims.has(premise)) issues.push(`${reasoning.id}: unknown premise ${premise}`)
      reasoningEdges.push([premise, reasoning.conclusionClaimId])
    }
  }
  if (graphHasCycle([...claims.keys()], reasoningEdges)) issues.push(`${fixture.id}: reasoning graph must be acyclic`)
  for (const event of fixture.events) for (const conditionId of event.conditionIds) if (!conditions.has(conditionId)) issues.push(`${event.id}: unknown condition ${conditionId}`)
  issues.push(...uniqueIssues(fixture.events.map((event) => event.sequenceIndex), `${fixture.id}: event sequence indexes`))
  for (const narrative of fixture.narratives) {
    for (const claimId of narrative.claimFragmentIds) {
      if (!claims.has(claimId)) issues.push(`${narrative.id}: unknown claim fragment ${claimId}`)
      else if (claims.get(claimId).regime !== 'NARRATIVE_CLAIM_FRAGMENT') issues.push(`${narrative.id}: story artifact may reference only narrative claim fragments`)
    }
    for (const eventId of [...narrative.selectedEventIds, ...narrative.omittedEventIds, ...narrative.orderedEventIds]) {
      if (!events.has(eventId)) issues.push(`${narrative.id}: unknown event ${eventId}`)
    }
    if (!equalSet([...narrative.selectedEventIds, ...narrative.omittedEventIds], [...events])) issues.push(`${narrative.id}: selected plus omitted events must cover the fixture event set`)
    if (narrative.selectedEventIds.some((eventId) => narrative.omittedEventIds.includes(eventId))) issues.push(`${narrative.id}: selected and omitted events overlap`)
    if (!equalSet(narrative.selectedEventIds, narrative.orderedEventIds)) issues.push(`${narrative.id}: ordered events must equal selected events`)
    for (const counterstoryId of narrative.counterstoryIds) {
      if (!narratives.has(counterstoryId) || counterstoryId === narrative.id) issues.push(`${narrative.id}: invalid counterstory ${counterstoryId}`)
    }
    for (const attribution of narrative.causalAttributions) {
      if (!events.has(attribution.fromEventId) || !events.has(attribution.toEventId)) issues.push(`${narrative.id}: causal attribution references unknown event`)
    }
  }
  for (const assessment of fixture.assessments) {
    if (assessment.fixtureId !== fixture.id) issues.push(`${assessment.id}: fixtureId mismatch`)
    if (assessment.window.from !== fixture.timeScope.from || assessment.window.through !== fixture.timeScope.through) issues.push(`${assessment.id}: assessment window must equal fixture window`)
    if (assessment.grantsAuthority !== false || assessment.authorizesAction !== false) issues.push(`${assessment.id}: authority boundary must remain false`)
    const allowedBasis = new Set([
      ...fixture.authorStipulatedConditions, ...fixture.expressions, ...fixture.evidence,
      ...fixture.reasoning, ...fixture.events, ...fixture.narratives, ...fixture.lifecycleRecords,
    ].map((entry) => entry.id))
    for (const basisId of assessment.basisIds) if (!allowedBasis.has(basisId)) issues.push(`${assessment.id}: unknown or level-unsafe basis ${basisId}`)
    for (const claimId of assessment.targetClaimIds) {
      const claim = claims.get(claimId)
      if (claim === undefined) { issues.push(`${assessment.id}: unknown target claim ${claimId}`); continue }
      const rule = compatibility.get(claim.regime)
      if (rule === undefined) {
        issues.push(`${assessment.id}: no compatibility rule for ${claim.regime}`)
        continue
      }
      if (!rule.compatibleMethodIds.includes(assessment.methodId)) issues.push(`${assessment.id}: method ${assessment.methodId} incompatible with ${claim.regime}`)
      if (!rule.compatibleDispositionIds.includes(assessment.disposition)) issues.push(`${assessment.id}: disposition ${assessment.disposition} incompatible with ${claim.regime}`)
    }
    for (const basisId of assessment.basisIds) {
      const evidence = evidenceById.get(basisId)
      if (evidence !== undefined && !evidence.bearsOnClaimIds.some((claimId) => assessment.targetClaimIds.includes(claimId))) {
        issues.push(`${assessment.id}: evidence basis ${basisId} does not bear on a target claim`)
      }
    }
  }
  const coveredClaims = new Set(fixture.assessments.flatMap((assessment) => assessment.targetClaimIds))
  for (const claimId of claims.keys()) if (!coveredClaims.has(claimId)) issues.push(`${fixture.id}: claim ${claimId} lacks an explicit L1 assessment`)
  for (const audit of fixture.assessmentAudits) {
    if (audit.fixtureId !== fixture.id) issues.push(`${audit.id}: fixtureId mismatch`)
    if (audit.methodId !== 'SELF_REFERENCE_STRATIFICATION_CHECK') issues.push(`${audit.id}: wrong audit method`)
    if (audit.attributedTo !== 'PHASE_0_SYNTHETIC_METHOD') issues.push(`${audit.id}: audit attribution mismatch`)
    if (audit.window.from !== fixture.timeScope.from || audit.window.through !== fixture.timeScope.through || audit.window.currentnessClaim !== false) issues.push(`${audit.id}: audit window must equal fixture window`)
    if (audit.grantsAuthority !== false || audit.authorizesAction !== false) issues.push(`${audit.id}: audit authority boundary violated`)
    for (const assessmentId of audit.targetAssessmentIds) if (!assessments.has(assessmentId)) issues.push(`${audit.id}: unknown L1 target ${assessmentId}`)
    if (audit.downwardOnly !== true || audit.cycleDetected !== false) issues.push(`${audit.id}: L2 audit must be downward-only and cycle-free`)
  }
  for (const lifecycle of fixture.lifecycleRecords) {
    for (const expressionId of [...lifecycle.targetExpressionIds, ...lifecycle.replacementExpressionIds]) if (!expressions.has(expressionId)) issues.push(`${lifecycle.id}: unknown expression ${expressionId}`)
    if (lifecycle.establishesTruthOrFalsehood !== false || lifecycle.preservesHistory !== true) issues.push(`${lifecycle.id}: lifecycle boundary violated`)
    if (['CORRECTED', 'SUPERSEDED'].includes(lifecycle.state) && lifecycle.replacementExpressionIds.length < 1) issues.push(`${lifecycle.id}: ${lifecycle.state} requires a replacement expression`)
    if (lifecycle.targetExpressionIds.some((expressionId) => lifecycle.replacementExpressionIds.includes(expressionId))) issues.push(`${lifecycle.id}: lifecycle record cannot replace an expression with itself`)
  }
  if (fixture.id === 'self-reference-stratified' && fixture.assessmentAudits.length !== 1) issues.push(`${fixture.id}: exactly one L2 audit required`)
  if (fixture.id !== 'self-reference-stratified' && fixture.assessmentAudits.length !== 0) issues.push(`${fixture.id}: L2 audit is reserved for self-reference fixture`)
  if (fixture.id === 'metaphysical-attribution-boundary') {
    const referent = fixture.claims.find((claim) => claim.regime === 'METAPHYSICAL_REFERENT_PROPOSITION')
    const targets = fixture.assessments.filter((assessment) => assessment.targetClaimIds.includes(referent?.id))
    if (targets.length !== 1 || !['OUTSIDE_NAMED_METHOD', 'INSUFFICIENT_FOR_NAMED_METHOD'].includes(targets[0]?.disposition)) issues.push(`${fixture.id}: referent proposition must remain outside or insufficient for named method`)
  }
  if (fixture.id === 'propaganda-label-action-refusal') {
    if (!fixture.nonClaims.some((text) => /does not set a misinformation or propaganda flag/u.test(text))) issues.push(`${fixture.id}: explicit label refusal missing`)
    if (!fixture.nonClaims.some((text) => /No label, assessment or receipt authorizes censorship/u.test(text))) issues.push(`${fixture.id}: explicit action refusal missing`)
  }
  return issues
}

function forbiddenShapeIssues(value, path = '$', issues = []) {
  if (value === null || typeof value !== 'object') return issues
  if (Array.isArray(value)) {
    value.forEach((child, index) => forbiddenShapeIssues(child, `${path}/${index}`, issues))
    return issues
  }
  const allowedNegativeKeys = new Set([
    'authorizesAction', 'grantsAuthority', 'scoresSourceOrPerson', 'establishesTruth',
    'establishesTruthOrFalsehood', 'establishesBeyondFixture', 'establishesTruthBeyondFixture',
    'canProduceGlobalVerdict', 'fixedPointVerdict', 'publicationAuthorized', 'personalData',
    'realPeople', 'liveClaims',
  ])
  const forbiddenExact = new Set([
    'truthStatus', 'groundTruth', 'globalVerdict', 'liarVerdict', 'personVerdict', 'sourceVerdict',
    'storyVerdict', 'inferredIntent', 'personRating', 'sourceRating', 'storyRating', 'actionRecommendation',
    'moderationDecision', 'enforcementDecision', 'realPersonName', 'email', 'phone', 'postcode',
    'accountId', 'userId', 'contact',
  ])
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}/${key}`
    const atConstitutionalInventory = path === '$/constitutionalBoundaries'
    const lower = key.toLowerCase()
    const scalarThreat = /(?:score|rank|ranking|rating|verdict|flag|action|recommendation|reward|penalty|reputation)$/u.test(lower)
    const entityProfileThreat = /^(?:person|source|community|witness)(?:id|identifier|profile|record|status)$/u.test(lower)
    const coerciveThreat = /(?:moderation|suppression|ban|enforcement)(?:action|decision|status|flag)?$/u.test(lower)
    const privateShapeThreat = /^(?:privatetestimony|contact|email|phone|address|biometric|biometrics|handle)(?:id|identifier|profile|record|status)?$/u.test(lower)
    const atTypedLevelRank = path.startsWith('$/selfReferenceStratification/levels/') && key === 'rank'
    if (!atConstitutionalInventory && !atTypedLevelRank && !allowedNegativeKeys.has(key)
      && (forbiddenExact.has(key) || scalarThreat || entityProfileThreat || coerciveThreat || privateShapeThreat)) {
      issues.push(`${childPath}: forbidden score, verdict, flag, action or personal field`)
    }
    forbiddenShapeIssues(child, childPath, issues)
  }
  return issues
}

export function semanticIssues(snapshot) {
  const issues = []
  if (snapshot.protocol !== 'kingdom.truth-relations/0.1') issues.push('protocol mismatch')
  if (snapshot.artifact.asOf !== '2026-08-26' || snapshot.fixtureSet.asOf !== '2026-08-26') issues.push('as-of date mismatch')
  if (!equalSet(snapshot.assessmentDispositions, schemaIdentity.dispositions)) issues.push('assessment disposition vocabulary mismatch')
  if (!equalSet(snapshot.claimRegimes.map((entry) => entry.id), schemaIdentity.regimes)) issues.push('claim regime vocabulary mismatch')
  if (!equalSet(snapshot.methodVocabulary.map((entry) => entry.id), schemaIdentity.methods)) issues.push('method vocabulary mismatch')
  if (!equalSet(snapshot.recordLifecycleStates.map((entry) => entry.id), schemaIdentity.lifecycleStates)) issues.push('lifecycle vocabulary mismatch')
  for (const key of schemaIdentity.boundaryKeys) if (snapshot.constitutionalBoundaries[key] !== false) issues.push(`constitutional boundary ${key} must be false`)
  if (!equalSet(Object.keys(snapshot.constitutionalBoundaries), schemaIdentity.boundaryKeys)) issues.push('constitutional boundary inventory mismatch')
  const compatibility = new Map(snapshot.regimeMethodCompatibility.map((entry) => [entry.regime, entry]))
  if (compatibility.size !== schemaIdentity.regimes.length || !schemaIdentity.regimes.every((regime) => compatibility.has(regime))) issues.push('regime compatibility matrix is incomplete')
  if (sha256Json(snapshot.regimeMethodCompatibility) !== EXPECTED_COMPATIBILITY_RECEIPT) issues.push('regime compatibility matrix differs from the reviewed exact contract')
  if (sha256Json(snapshot.selfReferenceStratification) !== EXPECTED_SELF_REFERENCE_RECEIPT) issues.push('self-reference level mapping differs from the reviewed exact contract')
  for (const rule of snapshot.regimeMethodCompatibility) if (rule.canProduceGlobalVerdict !== false) issues.push(`${rule.regime}: global verdict boundary violated`)
  if (!equalSet(snapshot.cases.map((fixture) => fixture.id), EXPECTED_CASE_IDS)) issues.push('fixture inventory mismatch')
  issues.push(...uniqueIssues(snapshot.cases.map((fixture) => fixture.id), 'fixture ids'))
  for (const fixture of snapshot.cases) issues.push(...fixtureIssues(fixture, compatibility))
  if (!equalSet(snapshot.predecessorBindings.map((binding) => binding.id), Object.keys(EXPECTED_PREDECESSORS))) issues.push('predecessor inventory mismatch')
  for (const binding of snapshot.predecessorBindings) {
    const expected = EXPECTED_PREDECESSORS[binding.id]
    if (binding.repositoryUrl !== EXPECTED_REPOSITORY || binding.revision !== EXPECTED_REVISION || binding.path !== expected?.[0] || binding.byteSha256 !== expected?.[1]) issues.push(`${binding.id}: predecessor locator or digest mismatch`)
    for (const key of ['copiesContent', 'importsAuthority', 'establishesTruth', 'authorizesAction']) if (binding[key] !== false) issues.push(`${binding.id}: ${key} must be false`)
    if (binding.usesForSemanticOrientation !== true || binding.characterizationAuthorship !== 'PHASE_0_PRODUCER_NON_AUTHORITATIVE') issues.push(`${binding.id}: semantic-orientation authorship boundary mismatch`)
  }
  const bindingIds = new Set(snapshot.predecessorBindings.map((binding) => binding.id))
  for (const contradiction of snapshot.contradictionRegister) {
    for (const bindingId of [...contradiction.mythicBindingIds, ...contradiction.operationalBindingIds]) if (!bindingIds.has(bindingId)) issues.push(`${contradiction.id}: unknown binding ${bindingId}`)
    if (contradiction.rewritesPredecessorOwners || contradiction.adjudicatesMetaphysics || contradiction.grantsAuthority) issues.push(`${contradiction.id}: contradiction boundary violated`)
  }
  if (canonicalJson(snapshot.counts) !== canonicalJson(totals(snapshot.cases, snapshot))) issues.push('declared counts mismatch')
  issues.push(...forbiddenShapeIssues(snapshot))
  const text = canonicalJson(snapshot)
  for (const pattern of [
    /"(?:truthStatus|groundTruth|globalVerdict|liarVerdict|personVerdict)"\s*:/iu,
    /mailto:/iu,
    /"(?:email|phone|postcode|contact|accountId|userId|realPersonName)"\s*:/iu,
  ]) if (pattern.test(text)) issues.push(`full-output forbidden pattern ${pattern}`)
  return [...new Set(issues)].sort()
}

function assertValidSnapshot(snapshot) {
  const schemaIssues = schemaDocumentIssues(publicSchema)
  if (schemaIssues.length > 0) throw new Error(`schema document invalid:\n${schemaIssues.join('\n')}`)
  const structural = validateWithSchema(snapshot, publicSchema)
  const semantic = semanticIssues(snapshot)
  const issues = [...structural, ...semantic]
  if (issues.length > 0) throw new Error(`atlas invalid:\n${issues.join('\n')}`)
}

export function buildAtlas() {
  const config = readJson(CONFIG_PATH)
  const fixtures = readJson(FIXTURES_PATH)
  const snapshot = {
    $schema: schemaIdentity.id,
    ...config,
    buildProvenance: buildProvenance(),
    fixtureSet: fixtures.fixtureSet,
    cases: fixtures.cases,
    counts: totals(fixtures.cases, config),
  }
  assertValidSnapshot(snapshot)
  return snapshot
}

export function renderedTriplet() {
  const atlas = buildAtlas()
  const guide = readUtf8Text(GUIDE_SOURCE_PATH)
  if (!guide.endsWith('\n')) throw new Error('public guide source must end with one newline')
  for (const marker of [
    'kingdom.truth-relations/0.1',
    'No global truth status',
    'L0',
    'L1',
    'L2',
    'no action authority',
  ]) if (!guide.includes(marker)) throw new Error(`public guide missing required marker ${JSON.stringify(marker)}`)
  return {
    atlas,
    atlasText: prettyCanonicalJson(atlas),
    schemaText: prettyCanonicalJson(publicSchema),
    guideText: guide,
  }
}

export function writeTriplet() {
  const preexisting = publicInventoryIssues({ allowMissing: true })
  if (preexisting.length > 0) throw new Error(`public inventory unsafe:\n${preexisting.join('\n')}`)
  const rendered = renderedTriplet()
  atomicWriteAuthorized(SCHEMA_PUBLIC_PATH, rendered.schemaText)
  atomicWriteAuthorized(GUIDE_PUBLIC_PATH, rendered.guideText)
  atomicWriteAuthorized(ATLAS_PUBLIC_PATH, rendered.atlasText)
  const inventory = publicInventoryIssues()
  if (inventory.length > 0) throw new Error(`public inventory invalid after build:\n${inventory.join('\n')}`)
  return tripletReceipts(rendered)
}

function outputReceipt(path, expectedText) {
  const bytes = Buffer.from(expectedText)
  return {
    path: relative(ROOT, path).split('/').join('/'),
    bytes: bytes.byteLength,
    byteSha256: sha256Bytes(bytes),
    current: existsSync(path) && readFileSync(path).equals(bytes),
  }
}

export function tripletReceipts(rendered = renderedTriplet()) {
  return {
    atlas: outputReceipt(ATLAS_PUBLIC_PATH, rendered.atlasText),
    schema: outputReceipt(SCHEMA_PUBLIC_PATH, rendered.schemaText),
    guide: outputReceipt(GUIDE_PUBLIC_PATH, rendered.guideText),
  }
}

export function checkTriplet() {
  const rendered = renderedTriplet()
  const inventory = publicInventoryIssues()
  const receipts = tripletReceipts(rendered)
  return {
    current: inventory.length === 0 && Object.values(receipts).every((receipt) => receipt.current),
    inventoryIssues: inventory,
    receipts,
    atlas: rendered.atlas,
  }
}
