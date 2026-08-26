import { canonicalJson } from './io.mjs'
import { publicSchema, schemaIdentity } from './schema-definition.mjs'

const MAX_SCHEMA_DEPTH = 96

function jsonEqual(left, right) {
  try { return canonicalJson(left) === canonicalJson(right) } catch { return false }
}

function typeMatches(value, type) {
  if (type === 'null') return value === null
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  if (type === 'integer') return Number.isSafeInteger(value)
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (['string', 'boolean'].includes(type)) return typeof value === type
  return false
}

function pointer(root, fragment) {
  if (fragment === '' || fragment === '#') return root
  if (!fragment.startsWith('#/')) throw new Error(`unsupported schema fragment ${fragment}`)
  let current = root
  for (const raw of fragment.slice(2).split('/')) {
    const token = raw.replaceAll('~1', '/').replaceAll('~0', '~')
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, token)) {
      throw new Error(`unresolved schema fragment ${fragment}`)
    }
    current = current[token]
  }
  return current
}

function validDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value)
  if (match === null) return false
  const instant = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return instant.getUTCFullYear() === Number(match[1])
    && instant.getUTCMonth() === Number(match[2]) - 1
    && instant.getUTCDate() === Number(match[3])
}

function formatMatches(value, format) {
  if (format === 'date') return validDate(value)
  if (format === 'uri') {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && url.username === '' && url.password === '' && url.port === '' && url.hash === ''
    } catch { return false }
  }
  return false
}

function resolveReference(reference, rootSchema) {
  if (reference.startsWith('#')) return pointer(rootSchema, reference)
  if (reference === schemaIdentity.id) return rootSchema
  if (reference.startsWith(`${schemaIdentity.id}#`)) return pointer(rootSchema, reference.slice(schemaIdentity.id.length))
  throw new Error(`unresolved schema reference ${reference}`)
}

function walk(value, schema, path, rootSchema, depth) {
  if (depth > MAX_SCHEMA_DEPTH) return [`${path}: schema nesting exceeds ${MAX_SCHEMA_DEPTH}`]
  if (schema === true) return []
  if (schema === false) return [`${path}: value is forbidden`]
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) return [`${path}: invalid schema node`]
  if (typeof schema.$ref === 'string') return walk(value, resolveReference(schema.$ref, rootSchema), path, rootSchema, depth + 1)

  const issues = []
  if (Object.hasOwn(schema, 'const') && !jsonEqual(value, schema.const)) issues.push(`${path}: must equal declared constant`)
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => jsonEqual(item, value))) issues.push(`${path}: value is outside enum`)
  if (schema.type !== undefined && !typeMatches(value, schema.type)) {
    issues.push(`${path}: expected ${schema.type}`)
    return issues
  }
  if (typeof value === 'string') {
    const length = [...value].length
    if (schema.minLength !== undefined && length < schema.minLength) issues.push(`${path}: string is too short`)
    if (schema.maxLength !== undefined && length > schema.maxLength) issues.push(`${path}: string is too long`)
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(value)) issues.push(`${path}: string does not match pattern`)
    if (typeof schema.format === 'string' && !formatMatches(value, schema.format)) issues.push(`${path}: string does not match ${schema.format} format`)
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) issues.push(`${path}: number is below minimum`)
    if (schema.maximum !== undefined && value > schema.maximum) issues.push(`${path}: number is above maximum`)
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) issues.push(`${path}: array has too few items`)
    if (schema.maxItems !== undefined && value.length > schema.maxItems) issues.push(`${path}: array has too many items`)
    if (schema.uniqueItems === true) {
      const keys = value.map((item) => canonicalJson(item))
      if (new Set(keys).size !== keys.length) issues.push(`${path}: array items must be unique`)
    }
    if (schema.items !== undefined) value.forEach((item, index) => issues.push(...walk(item, schema.items, `${path}/${index}`, rootSchema, depth + 1)))
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties ?? {}
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) issues.push(`${path}/${required}: required property is missing`)
    }
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) issues.push(...walk(child, properties[key], `${path}/${key}`, rootSchema, depth + 1))
      else if (schema.additionalProperties === false) issues.push(`${path}/${key}: additional property is forbidden`)
    }
  }
  return issues
}

export function validateWithSchema(value, schema = publicSchema) {
  return walk(value, schema, '$', schema, 0)
}

const SUPPORTED_KEYWORDS = new Set([
  '$defs', '$id', '$ref', '$schema', 'additionalProperties', 'const', 'description', 'enum', 'format',
  'items', 'maxItems', 'maxLength', 'maximum', 'minItems', 'minLength', 'minimum', 'pattern',
  'properties', 'required', 'title', 'type', 'uniqueItems',
])

function inspectSchema(schema, path, root, issues) {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    issues.push(`${path}: schema node must be an object`)
    return
  }
  for (const key of Object.keys(schema)) if (!SUPPORTED_KEYWORDS.has(key)) issues.push(`${path}/${key}: unsupported schema keyword`)
  if (schema.$ref !== undefined) {
    if (typeof schema.$ref !== 'string' || Object.keys(schema).length !== 1) issues.push(`${path}: $ref must be the sole string keyword`)
    else try { resolveReference(schema.$ref, root) } catch (error) { issues.push(`${path}: ${error.message}`) }
    return
  }
  if (schema.type === 'object') {
    if (schema.additionalProperties !== false) issues.push(`${path}: object schema must be closed`)
    if (schema.properties === null || typeof schema.properties !== 'object' || Array.isArray(schema.properties)) issues.push(`${path}: properties map required`)
    if (!Array.isArray(schema.required)) issues.push(`${path}: required array required`)
    else if (canonicalJson([...schema.required].sort()) !== canonicalJson(Object.keys(schema.properties ?? {}).sort())) {
      issues.push(`${path}: every closed object property must be required exactly once`)
    }
  }
  if (schema.type === 'array' && (schema.items === null || typeof schema.items !== 'object' || Array.isArray(schema.items))) {
    issues.push(`${path}: array item schema required`)
  }
  if (schema.format !== undefined && !['date', 'uri'].includes(schema.format)) issues.push(`${path}: unsupported format`)
  if (schema.pattern !== undefined) {
    try { new RegExp(schema.pattern, 'u') } catch { issues.push(`${path}: invalid pattern`) }
  }
  if (schema.type !== undefined && !['array', 'boolean', 'integer', 'number', 'object', 'string', 'null'].includes(schema.type)) issues.push(`${path}: unsupported type`)
  if (schema.enum !== undefined) {
    if (!Array.isArray(schema.enum) || schema.enum.length < 1) issues.push(`${path}: enum must be a non-empty array`)
    else if (new Set(schema.enum.map((value) => canonicalJson(value))).size !== schema.enum.length) issues.push(`${path}: enum members must be unique`)
  }
  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required) || !schema.required.every((value) => typeof value === 'string')) issues.push(`${path}: required must be a string array`)
    else if (new Set(schema.required).size !== schema.required.length) issues.push(`${path}: required members must be unique`)
  }
  for (const key of ['minItems', 'maxItems', 'minLength', 'maxLength', 'minimum', 'maximum']) {
    if (schema[key] !== undefined && (!Number.isSafeInteger(schema[key]) || schema[key] < 0)) issues.push(`${path}/${key}: invalid bound`)
  }
  if (schema.minItems !== undefined && schema.maxItems !== undefined && schema.minItems > schema.maxItems) issues.push(`${path}: minItems exceeds maxItems`)
  if (schema.minLength !== undefined && schema.maxLength !== undefined && schema.minLength > schema.maxLength) issues.push(`${path}: minLength exceeds maxLength`)
  for (const [key, child] of Object.entries(schema.properties ?? {})) inspectSchema(child, `${path}/properties/${key}`, root, issues)
  for (const [key, child] of Object.entries(schema.$defs ?? {})) inspectSchema(child, `${path}/$defs/${key}`, root, issues)
  if (schema.items !== undefined) inspectSchema(schema.items, `${path}/items`, root, issues)
}

export function schemaDocumentIssues(schema = publicSchema) {
  const issues = []
  if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') issues.push('unsupported or missing $schema')
  if (schema.$id !== schemaIdentity.id) issues.push(`$id must equal ${schemaIdentity.id}`)
  if (schema.type !== 'object' || schema.additionalProperties !== false) issues.push('root object must be closed')
  inspectSchema(schema, '$', schema, issues)
  return [...new Set(issues)].sort()
}
