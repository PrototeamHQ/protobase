import type { AssistantTool } from './tools'

// The names model endpoints accept for a function.
const toolName = /^[A-Za-z0-9_-]{1,64}$/

/** The tools in order; a name a model endpoint refuses, or one taken twice, stops the server at startup. */
export const checkedTools = (tools: AssistantTool[]) => {
  const seen = new Set<string>()
  for (const tool of tools) {
    if (!toolName.test(tool.name)) throw new Error(`Assistant tool name "${tool.name}" must be 1 to 64 letters, digits, _ or -`)
    if (seen.has(tool.name)) throw new Error(`Two assistant tools are named "${tool.name}"; give one of them another name`)
    seen.add(tool.name)
  }
  return tools
}
