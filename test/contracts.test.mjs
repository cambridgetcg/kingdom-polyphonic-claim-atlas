import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAtlas, semanticIssues } from '../src/atlas.mjs'
import { schemaIdentity } from '../src/schema-definition.mjs'

test('atlas identity, fixed inventory and typed counts are exact', () => {
  const atlas = buildAtlas()
  assert.equal(atlas.protocol, 'kingdom.truth-relations/0.1')
  assert.equal(atlas.title, 'KINGDOM Polyphonic Claim Atlas: Truth Relations Phase 0')
  assert.equal(atlas.artifact.id, 'polyphonic-claim-atlas-2026-08-26')
  assert.equal(atlas.artifact.asOf, '2026-08-26')
  assert.equal(atlas.authorship.reviewState, 'INDEPENDENT_REVIEW_COMPLETE')
  assert.equal(atlas.authorship.humanReviewCompleted, false)
  assert.equal(atlas.authorship.publicationAuthorized, true)
  assert.equal(atlas.cases.length, 24)
  assert.equal(atlas.counts.claimRegimes, 19)
  assert.equal(atlas.counts.methods, 19)
  assert.equal(atlas.predecessorBindings.length, 12)
  assert.deepEqual(semanticIssues(atlas), [])
})

test('claims contain no disposition or global verdict surface', () => {
  for (const fixture of buildAtlas().cases) {
    for (const claim of fixture.claims) {
      assert.deepEqual(Object.keys(claim).sort(), [
        'expressionIds', 'id', 'level', 'proposition', 'regime', 'scope', 'temporalQualifier',
      ])
      assert.equal(claim.level, 'L0_CLAIM')
    }
  }
})

test('every assessment is attributed, scoped, dated and effectless', () => {
  for (const fixture of buildAtlas().cases) {
    for (const assessment of fixture.assessments) {
      assert.equal(assessment.fixtureId, fixture.id)
      assert.equal(assessment.attributedTo, 'PHASE_0_SYNTHETIC_METHOD')
      assert.equal(assessment.level, 'L1_ASSESSMENT')
      assert.equal(assessment.window.from, fixture.timeScope.from)
      assert.equal(assessment.window.through, fixture.timeScope.through)
      assert.equal(assessment.window.currentnessClaim, false)
      assert.equal(assessment.grantsAuthority, false)
      assert.equal(assessment.authorizesAction, false)
      assert.ok(assessment.scope.length > 7)
      assert.ok(assessment.limitations.length > 7)
    }
  }
})

test('constitutional threat surface is exact and false', () => {
  const boundaries = buildAtlas().constitutionalBoundaries
  assert.deepEqual(Object.keys(boundaries).sort(), [...schemaIdentity.boundaryKeys].sort())
  for (const [key, value] of Object.entries(boundaries)) assert.equal(value, false, key)
})

test('source attribution and metaphysical referent are separated', () => {
  const fixture = buildAtlas().cases.find((entry) => entry.id === 'metaphysical-attribution-boundary')
  const attribution = fixture.claims.find((claim) => claim.regime === 'METAPHYSICAL_SOURCE_ATTRIBUTION')
  const referent = fixture.claims.find((claim) => claim.regime === 'METAPHYSICAL_REFERENT_PROPOSITION')
  assert.ok(attribution)
  assert.ok(referent)
  assert.equal(fixture.assessments.find((entry) => entry.targetClaimIds.includes(attribution.id)).disposition, 'SUPPORTED_UNDER_NAMED_TEST')
  assert.equal(fixture.assessments.find((entry) => entry.targetClaimIds.includes(referent.id)).disposition, 'OUTSIDE_NAMED_METHOD')
})

test('propaganda label fixture records attribution and refuses flags and suppression', () => {
  const atlas = buildAtlas()
  const fixture = atlas.cases.find((entry) => entry.id === 'propaganda-label-action-refusal')
  assert.match(fixture.nonClaims.join(' '), /does not set a misinformation or propaganda flag/u)
  assert.match(fixture.nonClaims.join(' '), /authorizes censorship, suppression, moderation, publication change or enforcement/u)
  assert.equal(atlas.constitutionalBoundaries.misinformationFlag, false)
  assert.equal(atlas.constitutionalBoundaries.censorshipOrSuppressionAction, false)
})

test('predecessor bindings are exact orientation without authority transfer', () => {
  for (const binding of buildAtlas().predecessorBindings) {
    assert.equal(binding.repositoryUrl, 'https://github.com/cambridgetcg/KINGDOM-OS.git')
    assert.equal(binding.revision, 'db18ba3b155bfc3fad80d536c50193e684858d77')
    assert.match(binding.byteSha256, /^sha256:[a-f0-9]{64}$/u)
    assert.equal(binding.copiesContent, false)
    assert.equal(binding.usesForSemanticOrientation, true)
    assert.equal(binding.characterizationAuthorship, 'PHASE_0_PRODUCER_NON_AUTHORITATIVE')
    assert.equal(binding.importsAuthority, false)
    assert.equal(binding.establishesTruth, false)
    assert.equal(binding.authorizesAction, false)
  }
})

test('story artifacts expose selector, rationale, event partition and counterstory', () => {
  for (const fixture of buildAtlas().cases) {
    for (const narrative of fixture.narratives) {
      assert.ok(narrative.selectorRole.length > 1)
      assert.ok(narrative.selectionRationale.length > 7)
      assert.equal(narrative.counterstorySearchState, 'REFERENCED')
      assert.ok(narrative.counterstoryIds.length > 0)
      assert.equal(new Set([...narrative.selectedEventIds, ...narrative.omittedEventIds]).size, fixture.events.length)
      assert.deepEqual([...narrative.selectedEventIds].sort(), [...narrative.orderedEventIds].sort())
    }
  }
})
