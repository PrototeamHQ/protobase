import type { LastSteps } from '@protobase/server/internal'

// The lines a migration Protobase wrote starts with, `-- protobase:<key> <value>`: its own id, the version that wrote
// it, each module's last step, the hash of the model, and whether organizations were ever on, as the snapshot is once
// it is applied; for a hand-written one, that it is, and whether it is marked additive.

export type Header = {
  id: string
  version: string
  steps: LastSteps
  model: string
  organizationsEverOn: boolean
  custom: boolean
  additive: boolean
}

const line = /^-- protobase:([a-z-]+)(?: (.*))?$/

export const headerText = ({ id, version, steps, model, organizationsEverOn, custom, additive }: Header) =>
  [
    `-- protobase:id ${id}`,
    `-- protobase:version ${version}`,
    `-- protobase:steps ${Object.entries(steps).map(([module, step]) => `${module}=${step}`).join(' ')}`.trimEnd(),
    `-- protobase:model ${model}`,
    ...(organizationsEverOn ? ['-- protobase:organizations ever-on'] : []),
    ...(custom ? ['-- protobase:custom'] : []),
    ...(additive ? ['-- protobase:additive'] : []),
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
  return {
    id,
    version: values.get('version') ?? '',
    steps: Object.fromEntries(steps.map(([module, step]) => [module, Number(step)])),
    model: values.get('model') ?? '',
    organizationsEverOn: values.get('organizations') === 'ever-on',
    custom: values.has('custom'),
    additive: values.has('additive'),
  }
}
