import { tableKey } from '../db/model'
import { renderField } from '../infer/render-field'
import { parseSource } from './project'
import { fieldsObject, resourceChain } from './existing-config'
import type { Decision, ResourcePlan } from './resource-plan'

const propertyText = ({ proposal, ignored }: Decision) =>
  ignored ? `${proposal.name}: null` : `${proposal.name}: ${renderField(proposal)}`

const refs = (names: string[]) => (names.length === 1 ? `r.${names[0]}` : `[${names.map((n) => `r.${n}`).join(', ')}]`)

const docComment = (plan: ResourcePlan) => {
  const unique = plan.unique.map((columns) => `(${columns.join(', ')})`).join(', ')
  return `/** ${tableKey(plan.table)}${unique ? `. Unique: ${unique}` : ''} */\n`
}

export const renderDataFile = (plan: ResourcePlan) => {
  const properties = plan.decisions.map((d) => `    ${propertyText(d)},`).join('\n')
  const tail = [
    `  .primaryKey((r) => ${refs(plan.primaryKey)})`,
    plan.softDelete && `  .softDelete((r) => r.${plan.softDelete})`,
    plan.tenant && `  .tenant((r) => r.${plan.tenant})`,
  ].filter(Boolean)
  return [
    `import { f, resource } from '@protobase/schema'`,
    '',
    `${docComment(plan)}export const ${plan.name} = resource('${plan.name}')`,
    `  .table('${tableKey(plan.table)}')`,
    `  .fields({`,
    properties,
    `  })`,
    ...tail,
    '',
  ].join('\n')
}

// Appends the decided columns to the existing `.fields({...})` object, leaving everything else untouched.
export const addFieldsToDataFile = (text: string, decisions: Decision[]) => {
  if (decisions.length === 0) return text
  const source = parseSource(text)
  const chain = resourceChain(source)
  const object = chain && fieldsObject(chain.chainTop)
  if (!object) throw new Error('data.ts has no resource(...).fields({...}) object to extend')
  for (const decision of decisions) {
    object.addPropertyAssignment({
      name: decision.proposal.name,
      initializer: decision.ignored ? 'null' : renderField(decision.proposal),
    })
  }
  return source.getFullText()
}
