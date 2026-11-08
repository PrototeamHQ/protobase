import { mcpInstructions } from './mcp-instructions'

/** How much of a server's instructions some MCP clients keep: they cut the rest. */
export const mcpInstructionsLimit = 4096

/**
 * The MCP endpoint's instructions: the framework's on reading records, then the app's own (`options.mcp.instructions`),
 * then, when workflows are on, the workflow guide. Stops the server at startup when the app's text takes the first two
 * past `mcpInstructionsLimit`, so a client that cuts there still reads all of it; the workflow guide may be cut.
 */
export const mcpServerInstructions = (app: string | undefined, workflows: string | undefined) => {
  const room = mcpInstructionsLimit - mcpInstructions.length - 1
  if (app !== undefined && app.length > room) throw new Error(`mcpEndpoint.instructions is ${app.length} characters, past the ${room} left beside the framework's instructions within ${mcpInstructionsLimit}`)
  return [mcpInstructions, app, workflows].filter((text) => text !== undefined).join('\n')
}
