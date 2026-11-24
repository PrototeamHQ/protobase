import type { LastSteps, ModulesModel } from '@protobase/server/internal'

// The lines a migration Protobase wrote starts with, `-- protobase:<key> <value>`: its own id, the version that wrote
// it, each sign-in module's last step, the schema modules' model as JSON, the hash of the model, and whether
// organizations were ever on, as the snapshot is once it is applied; for a hand-written one, that it is, and whether it
// is marked additive.

export type Header = {
  id: string
  version: string
  steps: LastSteps
  /** The schema modules' part of the model, which `protobase migration drop` takes the snapshot back to. */
  modules?: ModulesModel
  model: string
  organizationsEverOn: boolean
  custom: boolean
  additive: boolean
  /** A hand-written file that takes from older code what it reads, such as a rename: the version before refuses to start once it is applied. */
  breaksOlderCode: boolean
}

/** The line that marks a hand-written file as breaking older code, after `-- `. */
export const breaksOlderCodeLine = 'protobase:breaks-older-code'

const line = /^-- protobase:([a-z-]+)(?: (.*))?$/

export const headerText = ({ id, version, steps, modules, model, organizationsEverOn, custom, additive, breaksOlderCode }: Header) =>
  [
    `-- protobase:id ${id}`,
    `-- protobase:version ${version}`,
    `-- protobase:steps ${Object.entries(steps).map(([module, step]) => `${module}=${step}`).join(' ')}`.trimEnd(),
    ...(modules ? [`-- protobase:modules ${JSON.stringify(modules)}`] : []),
    `-- protobase:model ${model}`,
    ...(organizationsEverOn ? ['-- protobase:organizations ever-on'] : []),
    ...(custom ? ['-- protobase:custom'] : []),
    ...(additive ? ['-- protobase:additive'] : []),
    ...(breaksOlderCode ? [`-- ${breaksOlderCodeLine}`] : []),
  ].join('\n')

/** The header of a migration's text; `undefined` when it does not start with Protobase's id. */
export const parseHeader = (text: string): Header | undefined => {
  const values = new Map<string, string>()
  for (const row of text.split('\n')) {
    const found = line.exec(row)
    if (!found) break
    values.set(found[1]!, found[2] ?? '')
  }
  const id = values.get('id')
  if (!id) return
  const steps = (values.get('steps') ?? '').split(' ').filter(Boolean).map((pair) => pair.split('='))
  const modules = values.get('modules')
  return {
    id,
    version: values.get('version') ?? '',
    steps: Object.fromEntries(steps.map(([module, step]) => [module, Number(step)])),
    ...(modules && { modules: JSON.parse(modules) as ModulesModel }),
    model: values.get('model') ?? '',
    organizationsEverOn: values.get('organizations') === 'ever-on',
    custom: values.has('custom'),
    additive: values.has('additive'),
    breaksOlderCode: values.has('breaks-older-code'),
  }
}
