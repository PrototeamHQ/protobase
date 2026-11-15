import { Ajv } from 'ajv'
import type { CheckOptions } from '../definition/check-definition'
import type { JsonSchema } from './context'
import type { TypeEntry } from './type-list'
import { customPlugin, customStepOf } from './custom-step-id'
import { fileInputName, fileProperties } from '../runners/job-contract'

export { customPlugin, customStepOf }


/** One saved version of a custom step, as its type is made from it. */
export type CustomStepVersion = {
  name: string
  version: number
  label: string
  description: string | null
  input: JsonSchema
  output: JsonSchema
  error_prefix: string
  errors: Record<string, string>
}

/** A custom step's manifest as a create or an update writes it. */
export type CustomStepManifest = Partial<Omit<CustomStepVersion, 'version'>> & { container?: unknown }

/** A part of a manifest that cannot be saved: the field, such as `container.dockerfile`, and why. */
export type ManifestProblem = { field: string; message: string }

const stepName = /^[a-z][a-z0-9_]*$/
const errorName = /^[A-Z][A-Za-z0-9]*$/
const dockerfileBytes = 64 * 1024
const filesBytes = 1024 * 1024
const containerFields = ['dockerfile', 'files', 'command']

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const bytes = (text: string) => new TextEncoder().encode(text).length

// A Dockerfile's instructions, a line continued with `\` joined to the next, without its blank lines and comments.
const instructions = (dockerfile: string) =>
  dockerfile
    .replace(/\\\r?\n/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))

// Its first instruction other than an ARG is FROM, as Docker builds it.
const startsFrom = (dockerfile: string) => /^FROM\s/i.test(instructions(dockerfile).find((line) => !/^ARG\s/i.test(line)) ?? '')

const dockerfileProblems = (dockerfile: unknown): ManifestProblem[] => {
  const field = 'container.dockerfile'
  if (typeof dockerfile !== 'string' || dockerfile.trim() === '') return [{ field, message: 'is missing: give the Dockerfile the step is built from, as text' }]
  if (bytes(dockerfile) > dockerfileBytes) return [{ field, message: `is ${bytes(dockerfile)} bytes, more than the ${dockerfileBytes} a Dockerfile may have` }]
  return startsFrom(dockerfile) ? [] : [{ field, message: 'has no FROM instruction to start with; only ARG lines and comments may come before it' }]
}

// A path in the build's folder: relative, and never leaving it.
const pathProblem = (path: string) => {
  if (path === '') return 'is an empty path'
  if (path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:/.test(path)) return 'is an absolute path; give one relative to the build folder'
  if (path.split(/[/\\]/).includes('..')) return 'has a ".." segment; a file stays inside the build folder'
  return
}

const filesProblems = (files: unknown): ManifestProblem[] => {
  if (!isObject(files)) return [{ field: 'container.files', message: 'is an object of relative paths to their text, such as { "main.py": "..." }, or {} for none' }]
  const problems: ManifestProblem[] = []
  let total = 0
  for (const [path, text] of Object.entries(files)) {
    const problem = pathProblem(path)
    if (problem) problems.push({ field: 'container.files', message: `"${path}" ${problem}` })
    if (typeof text !== 'string') problems.push({ field: 'container.files', message: `"${path}" is not text` })
    else total += bytes(text)
  }
  if (total > filesBytes) problems.push({ field: 'container.files', message: `hold ${total} bytes together, more than the ${filesBytes} a step's files may have` })
  return problems
}

const commandProblems = (command: unknown): ManifestProblem[] => {
  if (command === undefined) return []
  const listed = Array.isArray(command) && command.length > 0 && command.every((part) => typeof part === 'string' && part !== '')
  return listed ? [] : [{ field: 'container.command', message: 'is a list of non-empty texts, such as ["python", "main.py"], or left out for the image\'s own' }]
}

const containerProblems = (container: unknown): ManifestProblem[] => {
  if (!isObject(container)) return [{ field: 'container', message: 'is an object of the step\'s dockerfile, files and command' }]
  const unknown = Object.keys(container).filter((key) => !containerFields.includes(key))
  return [
    ...unknown.map((key) => ({ field: `container.${key}`, message: 'is not a container field; a container takes dockerfile, files and command' })),
    ...dockerfileProblems(container.dockerfile),
    ...filesProblems(container.files),
    ...commandProblems(container.command),
  ]
}

// Every `x-file` in a schema, with the path to the schema that holds it.
const fileMarks = (node: unknown, path: string[] = []): { path: string[]; value: unknown }[] => {
  if (Array.isArray(node)) return node.flatMap((each, index) => fileMarks(each, [...path, String(index)]))
  if (!isObject(node)) return []
  return Object.entries(node).flatMap(([key, value]) => [...(key === 'x-file' ? [{ path, value }] : []), ...fileMarks(value, [...path, key])])
}

const schemaProblems = (field: 'input' | 'output', schema: unknown): ManifestProblem[] => {
  if (!isObject(schema) || schema.type !== 'object') return [{ field, message: 'is the JSON Schema of an object, with "type": "object"' }]
  const problems: ManifestProblem[] = []
  try {
    // A fresh Ajv, which goes with the check: it keeps what it compiles for its own life.
    new Ajv({ strict: false }).compile(schema)
  } catch (error) {
    problems.push({ field, message: `is no JSON Schema that compiles: ${error instanceof Error ? error.message : String(error)}` })
  }
  for (const mark of fileMarks(schema)) {
    const at = [field, ...mark.path, 'x-file'].join('.')
    if (mark.value !== true) problems.push({ field: at, message: 'is true for a stored file, or left out' })
    // The runner gives and takes files by the schema's own properties alone, so a mark anywhere else would be lost.
    else if (mark.path.length !== 2 || mark.path[0] !== 'properties') problems.push({ field: at, message: `is taken only on a property of ${field} itself, such as ${field}.properties.video, not inside another schema` })
  }
  // The runner gives each input file in a folder named after it, so its name must be one a folder can have.
  if (field === 'input') {
    for (const name of fileProperties(schema).filter((one) => !fileInputName.test(one))) {
      problems.push({ field: `input.properties.${name}`, message: 'is a file, which the container gets in a folder of its name: use letters, digits, "_", "." and "-", starting with a letter, a digit or "_"' })
    }
  }
  if (field === 'input' && isObject(schema.properties) && Object.hasOwn(schema.properties, 'store')) {
    problems.push({ field: 'input.properties.store', message: 'is the argument Protobase gives every custom step, where it stores the files it gives; name yours otherwise' })
  }
  return problems
}

const errorsProblems = (errors: unknown): ManifestProblem[] => {
  if (!isObject(errors)) return [{ field: 'errors', message: 'is an object of error names to what each means, such as { "Refused": "the service refused the invoice" }' }]
  return Object.entries(errors).flatMap(([name, text]) => [
    ...(errorName.test(name) ? [] : [{ field: 'errors', message: `"${name}" is not an error name; start with a capital, then letters and digits` }]),
    ...(typeof text === 'string' ? [] : [{ field: 'errors', message: `${name} is not text; say what the error means` }]),
  ])
}

/**
 * Why a custom step's manifest cannot be saved, each problem naming its field: its name, its container's Dockerfile,
 * files and command, its input and output schemas, its error prefix and its errors. Empty when it can be saved.
 */
export const manifestProblems = (manifest: CustomStepManifest): ManifestProblem[] => {
  const { name, error_prefix: prefix } = manifest
  return [
    ...(typeof name === 'string' && stepName.test(name) && name.length <= 64 ? [] : [{ field: 'name', message: 'is a lowercase letter, then lowercase letters, digits and "_", at most 64' }]),
    ...containerProblems(manifest.container),
    ...schemaProblems('input', manifest.input),
    ...schemaProblems('output', manifest.output),
    // `States.` names the language's own errors
    ...(typeof prefix === 'string' && errorName.test(prefix) && prefix !== 'States' ? [] : [{ field: 'error_prefix', message: 'is a capital, then letters and digits, other than States, such as Invoice' }]),
    ...errorsProblems(manifest.errors),
  ]
}

const configuration = { type: 'string', description: 'the name of a storage configuration, such as "archive"' }
const path = { type: 'string', description: 'the folder in it the files go in, each by its path in the step\'s output folder; default a folder of this step in this run' }

// Where every custom step stores the files it gives, as app:http's `store` takes it.
const storeArgument = { type: 'object', required: ['configuration'], description: 'where the step stores the files it gives: a storage configuration and, when given, a folder in it', properties: { configuration, path } }

const givesFile = (schema: JsonSchema) => fileMarks(schema).some((mark) => mark.value === true)

/**
 * The step type `custom:<name>:<version>` of a saved version: its label and description, its input with `store`, which
 * it requires when its output gives a stored file, its output, and its errors as `<error_prefix>.<Name>`.
 */
export const customStepEntry = (step: CustomStepVersion): TypeEntry => {
  const required = Array.isArray(step.input.required) ? (step.input.required as string[]) : []
  const properties = isObject(step.input.properties) ? step.input.properties : {}
  const errors = Object.entries(step.errors)
  return {
    id: `${customPlugin}:${step.name}:${step.version}`,
    kind: 'step',
    plugin: customPlugin,
    label: step.label,
    description: step.description ?? '',
    input: { ...step.input, properties: { ...properties, store: storeArgument }, ...(givesFile(step.output) && { required: [...required, 'store'] }) },
    output: step.output,
    ...(errors.length > 0 && { errors: Object.fromEntries(errors.map(([name, text]) => [`${step.error_prefix}.${name}`, text])) }),
    // What its container changes is its own, so a replay does not run it
    writes: true,
    available: true,
  }
}

const requiredInputs = (input: JsonSchema) => (Array.isArray(input.required) ? (input.required as string[]) : [])

/** The latest version of each custom step among `ids`, by the step's unversioned id, `custom:<name>`. */
export const latestCustomSteps = (ids: readonly string[]): Record<string, string> => {
  const latest = new Map<string, { id: string; version: number }>()
  for (const id of ids) {
    const step = customStepOf(id)
    if (step && step.version > (latest.get(step.name)?.version ?? 0)) latest.set(step.name, { id, version: step.version })
  }
  return Object.fromEntries([...latest].map(([name, found]) => [`${customPlugin}:${name}`, found.id]))
}

/**
 * A tenant's custom step types added to the app's: to a type list (`types`), after the app's own, and to what a
 * definition is checked against (`check`), their arguments and pins included, with `custom:<name>` without a version
 * refused naming the latest.
 */
export const withCustomSteps = (custom: readonly TypeEntry[]) => ({
  types: (types: readonly TypeEntry[]): TypeEntry[] => [...types, ...custom],
  check: (check: CheckOptions): CheckOptions => {
    if (custom.length === 0) return check
    return {
      ...check,
      resources: [...check.resources, ...custom.map((type) => type.id)],
      required: { ...check.required, ...Object.fromEntries(custom.map((type) => [type.id, requiredInputs(type.input)])) },
      versioned: { ...check.versioned, ...latestCustomSteps(custom.map((type) => type.id)) },
      ...(check.pins && {
        pins: {
          ...check.pins,
          inputs: { ...check.pins.inputs, ...Object.fromEntries(custom.map((type) => [type.id, type.input])) },
          outputs: { ...check.pins.outputs, ...Object.fromEntries(custom.flatMap((type) => (type.output ? [[type.id, type.output]] : []))) },
        },
      }),
    }
  },
})
