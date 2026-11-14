import { partsOfDefinition, type Definition } from '@protobase/workflows'

/** A definition as a workflow record's fields, which a test writes through the API or an MCP tool, without the empty ones. */
export const definitionFields = (definition: unknown) => Object.fromEntries(Object.entries(partsOfDefinition(definition as Definition)).filter(([, value]) => value !== null))
