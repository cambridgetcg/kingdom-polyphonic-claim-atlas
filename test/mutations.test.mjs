import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAtlas, semanticIssues } from '../src/atlas.mjs'
import { canonicalJson } from '../src/io.mjs'
import { publicSchema } from '../src/schema-definition.mjs'
import { validateWithSchema } from '../src/schema-validator.mjs'

const clone = (value) => JSON.parse(canonicalJson(value))
const expectSemanticFailure = (mutate, pattern) => {
  const atlas = clone(buildAtlas())
  mutate(atlas)
  assert.match(semanticIssues(atlas).join('\n'), pattern)
}

test('claim-level truth and disposition fields fail closed structurally and semantically', () => {
  for (const [key, value] of [['truthStatus', 'TRUE'], ['groundTruth', true], ['disposition', 'SUPPORTED_UNDER_NAMED_TEST']]) {
    const atlas = clone(buildAtlas())
    atlas.cases[0].claims[0][key] = value
    assert.match(validateWithSchema(atlas, publicSchema).join('\n'), /additional property is forbidden/u)
    assert.match(semanticIssues(atlas).join('\n'), /claim-level verdict fields|forbidden pattern/u)
  }
})

test('lower-case score, action, identity and coercion fields fail both schema and semantic defenses', () => {
  for (const [key, value] of [
    ['score', 1],
    ['action', 'REMOVE'],
    ['personId', 'synthetic-person'],
    ['sourceProfile', {}],
    ['communityRating', 5],
    ['witnessRank', 1],
    ['moderationDecision', 'BLOCK'],
    ['suppressionFlag', true],
    ['enforcementAction', 'NONE'],
    ['privateTestimony', 'hidden'],
    ['biometricId', 'shape'],
    ['handle', 'name'],
  ]) {
    const atlas = clone(buildAtlas())
    atlas.cases[0].claims[0][key] = value
    assert.match(validateWithSchema(atlas, publicSchema).join('\n'), /additional property is forbidden/u, key)
    assert.match(semanticIssues(atlas).join('\n'), /forbidden score, verdict, flag, action or personal field/u, key)
  }
})

test('regime compatibility rows cannot be missing, duplicated or bypassed', () => {
  expectSemanticFailure((atlas) => { atlas.regimeMethodCompatibility.pop() }, /matrix is incomplete/u)
  expectSemanticFailure((atlas) => {
    const assessment = atlas.cases.find((fixture) => fixture.id === 'normative-is-ought-boundary').assessments[0]
    assessment.methodId = 'DECLARED_FIXTURE_WORLD_COMPARISON'
  }, /incompatible with NORMATIVE/u)
  expectSemanticFailure((atlas) => {
    const fixture = atlas.cases.find((entry) => entry.id === 'metaphysical-attribution-boundary')
    fixture.assessments.find((entry) => entry.targetClaimIds.includes(`${fixture.id}:claim-2`)).disposition = 'SUPPORTED_UNDER_NAMED_TEST'
  }, /incompatible with METAPHYSICAL_REFERENT_PROPOSITION|referent proposition must remain/u)
})

test('cross references and fixture identity fail closed', () => {
  expectSemanticFailure((atlas) => { atlas.cases[0].assessments[0].targetClaimIds[0] = 'foreign:claim-1' }, /unknown target claim/u)
  expectSemanticFailure((atlas) => { atlas.cases[0].assessments[0].fixtureId = atlas.cases[1].id }, /fixtureId mismatch/u)
  expectSemanticFailure((atlas) => { atlas.cases[0].claims[0].expressionIds[0] = 'foreign:expression-1' }, /unknown expression/u)
  expectSemanticFailure((atlas) => { atlas.cases[0].assessments[0].basisIds[0] = atlas.cases[0].assessments[0].id }, /level-unsafe basis/u)
})

test('reasoning self-cycles and derived cycles are rejected', () => {
  expectSemanticFailure((atlas) => {
    const fixture = atlas.cases.find((entry) => entry.id === 'valid-inference-false-premise')
    fixture.reasoning[0].premiseClaimIds = [fixture.reasoning[0].conclusionClaimId]
  }, /reasoning graph must be acyclic/u)
})

test('L2 audits can target only known L1 assessments and must remain downward-only', () => {
  expectSemanticFailure((atlas) => {
    atlas.cases.find((entry) => entry.id === 'self-reference-stratified').assessmentAudits[0].targetAssessmentIds[0] = 'self-reference-stratified:audit-1'
  }, /unknown L1 target/u)
  expectSemanticFailure((atlas) => {
    atlas.cases.find((entry) => entry.id === 'self-reference-stratified').assessmentAudits[0].downwardOnly = false
  }, /downward-only/u)
})

test('narrative selection partition, ordering and counterstory are mandatory', () => {
  expectSemanticFailure((atlas) => {
    const narrative = atlas.cases.find((entry) => entry.id === 'selective-omission').narratives[0]
    narrative.omittedEventIds = []
  }, /selected plus omitted events must cover/u)
  expectSemanticFailure((atlas) => {
    const narrative = atlas.cases.find((entry) => entry.id === 'two-coherent-narratives').narratives[0]
    narrative.orderedEventIds.pop()
  }, /ordered events must equal selected/u)
  const atlas = clone(buildAtlas())
  atlas.cases.find((entry) => entry.id === 'two-coherent-narratives').narratives[0].counterstoryIds = []
  assert.match(validateWithSchema(atlas, publicSchema).join('\n'), /array has too few items/u)
})

test('record lifecycle cannot become truth, falsehood or erasure', () => {
  const atlas = clone(buildAtlas())
  const record = atlas.cases.find((entry) => entry.id === 'official-correction').lifecycleRecords[0]
  record.establishesTruthOrFalsehood = true
  record.preservesHistory = false
  assert.match(validateWithSchema(atlas, publicSchema).join('\n'), /must equal declared constant/u)
  assert.match(semanticIssues(atlas).join('\n'), /lifecycle boundary violated/u)
})

test('predecessor locator, digest and non-authority fields cannot rotate silently', () => {
  for (const mutate of [
    (binding) => { binding.path = '../README.md' },
    (binding) => { binding.repositoryUrl = 'http://example.test/repo' },
    (binding) => { binding.byteSha256 = `sha256:${'0'.repeat(64)}` },
    (binding) => { binding.establishesTruth = true },
  ]) expectSemanticFailure((atlas) => mutate(atlas.predecessorBindings[0]), /predecessor locator or digest mismatch|establishesTruth must be false/u)
})

test('evidence, assessment and constitutional effects stay false', () => {
  const atlas = clone(buildAtlas())
  atlas.cases[0].evidence[0].establishesTruth = true
  atlas.cases[0].assessments[0].authorizesAction = true
  atlas.constitutionalBoundaries.misinformationFlag = true
  assert.match(validateWithSchema(atlas, publicSchema).join('\n'), /must equal declared constant/u)
  assert.match(semanticIssues(atlas).join('\n'), /evidence boundary|authority boundary|misinformationFlag/u)
})
