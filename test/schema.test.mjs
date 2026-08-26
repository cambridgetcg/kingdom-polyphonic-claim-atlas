import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAtlas } from '../src/atlas.mjs'
import { canonicalJson } from '../src/io.mjs'
import { publicSchema } from '../src/schema-definition.mjs'
import { schemaDocumentIssues, validateWithSchema } from '../src/schema-validator.mjs'

const clone = (value) => JSON.parse(canonicalJson(value))

test('public schema is Draft 2020-12, closed and validates the atlas', () => {
  assert.equal(publicSchema.$schema, 'https://json-schema.org/draft/2020-12/schema')
  assert.equal(publicSchema.$id, 'https://thekingdom.dev/truth/schemas/v0.1/public-snapshot.schema.json')
  assert.deepEqual(schemaDocumentIssues(publicSchema), [])
  assert.deepEqual(validateWithSchema(buildAtlas(), publicSchema), [])
})

test('every object schema is closed and requires every declared property', () => {
  const visit = (schema, path = '$') => {
    if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) return
    if (schema.type === 'object') {
      assert.equal(schema.additionalProperties, false, path)
      assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), path)
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) visit(child, `${path}/properties/${key}`)
    for (const [key, child] of Object.entries(schema.$defs ?? {})) visit(child, `${path}/$defs/${key}`)
    if (schema.items) visit(schema.items, `${path}/items`)
  }
  visit(publicSchema)
})

test('schema document rejects unknown keywords, duplicate enums and required members, unsupported types and broken refs', () => {
  for (const mutate of [
    (schema) => { schema.$defs.claim.unknownKeyword = true },
    (schema) => { schema.$defs.claim.properties.regime.enum.push(schema.$defs.claim.properties.regime.enum[0]) },
    (schema) => { schema.$defs.claim.required.push('id') },
    (schema) => { schema.$defs.claim.properties.scope.type = 'mystery' },
    (schema) => { schema.$defs.claim.properties.scope = { $ref: '#/$defs/missing' } },
  ]) {
    const schema = clone(publicSchema)
    mutate(schema)
    assert.notDeepEqual(schemaDocumentIssues(schema), [])
  }
})

test('schema URI and predecessor path checks reject unsafe values', () => {
  const atlas = clone(buildAtlas())
  const schema = clone(publicSchema)
  delete schema.$defs.predecessorBinding.properties.repositoryUrl.const
  schema.$defs.predecessorBinding.properties.repositoryUrl.minLength = 1
  schema.$defs.predecessorBinding.properties.repositoryUrl.maxLength = 300
  atlas.predecessorBindings[0].repositoryUrl = 'ftp://user:pass@example.test/repo#fragment'
  atlas.predecessorBindings[0].path = '../README.md'
  const issues = validateWithSchema(atlas, schema).join('\n')
  assert.match(issues, /uri format/u)
  assert.match(issues, /does not match pattern/u)
})

test('additional fields fail closed at root and nested levels', () => {
  for (const mutate of [
    (atlas) => { atlas.truthStatus = 'TRUE' },
    (atlas) => { atlas.cases[0].claims[0].score = 1 },
    (atlas) => { atlas.cases[0].narratives.push({}) },
  ]) {
    const atlas = clone(buildAtlas())
    mutate(atlas)
    assert.notDeepEqual(validateWithSchema(atlas, publicSchema), [])
  }
})
