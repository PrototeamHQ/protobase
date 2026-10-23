import { resourceParameter } from './record-tool-args'

/** The resources the write tools may change: any the caller may write, or only those listed. */
export type WriteRecordToolsInput = { resources?: string[] }

// Named in the description rather than as an enum, which MCP's own argument check would refuse with a vaguer message.
export const resourceParameterFor = ({ resources }: WriteRecordToolsInput) =>
  resources ? { ...resourceParameter, description: `The resource's name: one of ${resources.join(', ')}.` } : resourceParameter

export const onlyNote = ({ resources }: WriteRecordToolsInput) => (resources ? ` It writes only ${resources.join(', ')}.` : '')

// The same shape as a refusal of the access rules, so the client reads both alike.
export const forbiddenText = (message: string) => JSON.stringify({ error: 'forbidden', message })

export const outside = ({ resources }: WriteRecordToolsInput, resource: string) =>
  resources && !resources.includes(resource) ? forbiddenText(`Writes over MCP reach only ${resources.join(', ')}, not ${resource}; nothing was written.`) : undefined

export const notApproved = (answer: string) => `The user did not approve this change (${answer}); nothing was written.`
