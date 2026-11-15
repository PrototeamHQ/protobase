import { describe, expect, it } from 'vitest'
import { checkDefinition, type CheckOptions } from '../definition/check-definition'
import { pinProblems } from '../definition/pins/check-pins'
import { resolveSchema } from '../definition/pins/resolve-schema'
import type { Definition } from '../definition/types'
import { memoryRunner } from '../run/memory-port'
import { customStepEntry, customStepOf, latestCustomSteps, manifestProblems, withCustomSteps, type CustomStepManifest, type CustomStepVersion } from './custom-steps'
import { definePlugin } from './define-plugin'
import { loadPlugins } from './load-plugins'
import { storedFileSchema } from './stored-file'

const manifest: CustomStepManifest = {
  name: 'invoice_pdf',
  label: 'Invoice PDF',
  description: 'Renders an invoice as a PDF.',
  container: { dockerfile: '# The renderer\nARG PYTHON=3.13\nFROM python:${PYTHON}-slim\nCOPY main.py .', files: { 'main.py': 'print(1)', 'lib/render.py': '' }, command: ['python', 'main.py'] },
  input: { type: 'object', required: ['number'], properties: { number: { type: 'string' }, logo: { 'x-file': true } } },
  output: { type: 'object', properties: { pdf: { 'x-file': true, title: 'PDF' }, pages: { type: 'integer' } } },
  error_prefix: 'Invoice',
  errors: { Refused: 'the renderer refused the invoice' },
}

const version = (name: string, number: number, changes: Partial<CustomStepVersion> = {}): CustomStepVersion => ({
  name,
  version: number,
  label: 'Invoice PDF',
  description: null,
  input: manifest.input!,
  output: manifest.output!,
  error_prefix: 'Invoice',
  errors: { Refused: 'the renderer refused the invoice' },
  ...changes,
})

const definition = (states: Definition['stateMachine']['States']): Definition => ({ trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: Object.keys(states)[0]!, States: states } })

const appCheck: CheckOptions = { resources: ['app:http'], triggers: {}, required: { 'app:http': ['url'] }, pins: { inputs: { 'app:http': { type: 'object', properties: { url: { type: 'string' } } } }, outputs: { 'app:http': { type: 'object', properties: { status: { type: 'integer' } } } }, records: () => undefined } }

describe("a custom step's manifest", () => {
  it('takes a container step with a FROM after ARG lines and comments, relative files, a command, object schemas and errors', () => {
    expect(manifestProblems(manifest)).toEqual([])
    expect(manifestProblems({ ...manifest, container: { dockerfile: 'from alpine', files: {} } })).toEqual([])
  })

  it('refuses each part that breaks a rule, naming its field', () => {
    const fields = (changes: CustomStepManifest) => manifestProblems({ ...manifest, ...changes }).map((problem) => problem.field)
    expect(fields({ name: 'Invoice' })).toEqual(['name'])
    expect(fields({ name: `a${'b'.repeat(64)}` })).toEqual(['name'])
    expect(fields({ container: { dockerfile: 'RUN echo\nFROM alpine', files: {} } })).toEqual(['container.dockerfile'])
    expect(fields({ container: { dockerfile: '  ', files: {} } })).toEqual(['container.dockerfile'])
    expect(fields({ container: { dockerfile: `FROM alpine\n#${'x'.repeat(64 * 1024)}`, files: {} } })).toEqual(['container.dockerfile'])
    expect(fields({ container: { dockerfile: 'FROM alpine', files: { '/etc/passwd': '', 'a/../../b': '', 'c\\..\\d': '', 'e.txt': 1 } } })).toEqual(['container.files', 'container.files', 'container.files', 'container.files'])
    expect(fields({ container: { dockerfile: 'FROM alpine', files: { 'big.txt': 'x'.repeat(1024 * 1024 + 1) } } })).toEqual(['container.files'])
    expect(fields({ container: { dockerfile: 'FROM alpine' } })).toEqual(['container.files'])
    for (const command of [[], [''], 'python main.py', [1]]) expect(fields({ container: { dockerfile: 'FROM alpine', files: {}, command } })).toEqual(['container.command'])
    expect(fields({ container: { dockerfile: 'FROM alpine', files: {}, network: 'none' } })).toEqual(['container.network'])
    expect(fields({ container: 'FROM alpine' })).toEqual(['container'])
    expect(fields({ input: { type: 'string' } })).toEqual(['input'])
    expect(fields({ output: { type: 'object', properties: { n: { type: 'integr' } } } })).toEqual(['output'])
    expect(fields({ output: { type: 'object', properties: { pdf: { 'x-file': 'yes' } } } })).toEqual(['output.properties.pdf.x-file'])
    expect(fields({ input: { type: 'object', properties: { store: { type: 'string' } } } })).toEqual(['input.properties.store'])
    for (const prefix of ['invoice', 'States', 'In voice']) expect(fields({ error_prefix: prefix })).toEqual(['error_prefix'])
    expect(fields({ errors: { refused: 'no', Gone: 3 } as never })).toEqual(['errors', 'errors'])
    expect(manifestProblems({ ...manifest, output: { type: 'object', properties: { n: { type: 'integr' } } } })[0]!.message).toContain('is no JSON Schema that compiles')
  })
})

describe('the step types of custom steps', () => {
  it('names each version custom:<name>:<version>, with store beside its input, required when it gives a file, and its errors prefixed', () => {
    const entry = customStepEntry(version('invoice_pdf', 2, { description: 'Renders it.' }))
    expect(entry).toMatchObject({ id: 'custom:invoice_pdf:2', kind: 'step', plugin: 'custom', label: 'Invoice PDF', description: 'Renders it.', output: manifest.output, errors: { 'Invoice.Refused': 'the renderer refused the invoice' }, writes: true, available: true })
    expect(entry.input).toMatchObject({ required: ['number', 'store'], properties: { number: { type: 'string' }, store: { type: 'object', required: ['configuration'] } } })
    const plain = customStepEntry(version('count', 1, { output: { type: 'object', properties: { n: { type: 'integer' } } }, errors: {} }))
    expect(plain.input.required).toEqual(['number'])
    expect(plain).not.toHaveProperty('errors')
  })

  it('adds them to the type list and the check, their arguments and pins included, and refuses one that names no version naming the latest', () => {
    const custom = [customStepEntry(version('invoice_pdf', 1)), customStepEntry(version('invoice_pdf', 2)), customStepEntry(version('count', 1))]
    const merged = withCustomSteps(custom)
    expect(merged.types([]).map((type) => type.id)).toEqual(['custom:invoice_pdf:1', 'custom:invoice_pdf:2', 'custom:count:1'])
    const check = merged.check(appCheck)
    expect(check.resources).toEqual(['app:http', 'custom:invoice_pdf:1', 'custom:invoice_pdf:2', 'custom:count:1'])
    expect(check.required?.['custom:invoice_pdf:2']).toEqual(['number', 'store'])
    expect(check.versioned).toEqual({ 'custom:invoice_pdf': 'custom:invoice_pdf:2', 'custom:count': 'custom:count:1' })
    expect(withCustomSteps([]).check(appCheck)).toBe(appCheck)

    const task = (resource: string, args: Record<string, unknown>) => definition({ Render: { Type: 'Task', Resource: resource, Arguments: args, End: true } })
    expect(checkDefinition(task('custom:invoice_pdf:2', { number: '1', store: { configuration: 'archive' } }), check)).toEqual([])
    expect(checkDefinition(task('custom:invoice_pdf:2', { number: '1' }), check)).toEqual([{ state: 'Render', field: 'Arguments.store', message: 'is missing; custom:invoice_pdf:2 needs it' }])
    expect(checkDefinition(task('custom:invoice_pdf', { number: '1' }), check)).toEqual([{ state: 'Render', field: 'Resource', message: '"custom:invoice_pdf" names no version: write custom:invoice_pdf:2' }])
    expect(checkDefinition(task('custom:invoice_pdf:3', {}), check)[0]).toMatchObject({ field: 'Resource', message: expect.stringContaining('"custom:invoice_pdf:3" is not a step type') })
    expect(checkDefinition(task('custom:nothing', {}), check)[0]).toMatchObject({ field: 'Resource', message: expect.stringContaining('"custom:nothing" is not a step type') })
    // Without them, as for another tenant, none is a step type
    expect(checkDefinition(task('custom:invoice_pdf:2', { number: '1', store: { configuration: 'archive' } }), appCheck)[0]).toMatchObject({ field: 'Resource' })
  })

  it("types their pins from the manifest, a file as a stored file", () => {
    const check = withCustomSteps([customStepEntry(version('invoice_pdf', 1))]).check(appCheck)
    const flow = (number: string) => definition({
      Render: { Type: 'Task', Resource: 'custom:invoice_pdf:1', Arguments: { number, store: { configuration: 'archive' } }, Assign: { invoice: '{% $states.result %}' }, Next: 'Send' },
      Send: { Type: 'Task', Resource: 'app:http', Arguments: { url: '{% $invoice.pages %}' }, End: true },
    })
    expect(pinProblems(flow('1'), check.pins!)).toEqual([{ state: 'Send', field: 'Arguments.url', message: 'reads $invoice.pages, a whole number, where url takes text' }])
    expect(resolveSchema(manifest.output!, {}, () => undefined)).toEqual({ type: 'object', properties: { pdf: { ...storedFileSchema, title: 'PDF' }, pages: { type: 'integer' } } })
  })
})

describe('the custom plugin name', () => {
  it('reads the custom step and version an id names, and the latest of each step', () => {
    expect(customStepOf('custom:invoice:12')).toEqual({ name: 'invoice', version: 12 })
    expect([customStepOf('custom:invoice'), customStepOf('acme:send'), customStepOf('custom:invoice:0')]).toEqual([undefined, undefined, undefined])
    expect(latestCustomSteps(['custom:invoice:2', 'custom:invoice:10', 'custom:resize:1', 'app:http'])).toEqual({ 'custom:invoice': 'custom:invoice:10', 'custom:resize': 'custom:resize:1' })
  })

  it('is kept for custom steps: loading a plugin of that name stops, saying why', () => {
    const plugin = definePlugin({ name: 'custom', label: 'Custom', steps: {} })
    expect(() => loadPlugins([{ plugin, source: 'workflows/plugins/custom.ts' }])).toThrow('Workflow plugin "custom" of workflows/plugins/custom.ts: "custom" is kept for the app\'s custom steps')
  })
})

describe('a run of a custom step', () => {
  it('fails with States.Runtime, as custom steps do not run yet', async () => {
    const port = memoryRunner({})
    await port.start('r1', definition({ Render: { Type: 'Task', Resource: 'custom:invoice_pdf:1', Arguments: { number: '1' }, End: true } }), {})
    await port.drain()
    expect(port.run('r1')).toMatchObject({ status: 'failed', error: 'States.Runtime', cause: 'Custom steps do not run yet' })
  })
})
