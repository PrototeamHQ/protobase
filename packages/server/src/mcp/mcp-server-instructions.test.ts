import { describe, expect, it } from 'vitest'
import { mcpInstructions } from './mcp-instructions'
import { mcpServerInstructions } from './mcp-server-instructions'

describe('the MCP endpoint\'s instructions', () => {
  it('leave the app 2,691 characters beside the framework\'s', () => {
    expect(mcpInstructions.length).toBe(1404)
  })

  it('are the framework\'s alone without the app\'s or workflows', () => {
    expect(mcpServerInstructions(undefined, undefined)).toBe(mcpInstructions)
  })

  it('put the app\'s text after the framework\'s, and the workflow guide last', () => {
    expect(mcpServerInstructions('Plan a big ask first.', undefined)).toBe(`${mcpInstructions}\nPlan a big ask first.`)
    expect(mcpServerInstructions('Plan a big ask first.', 'Workflows: ...')).toBe(`${mcpInstructions}\nPlan a big ask first.\nWorkflows: ...`)
    expect(mcpServerInstructions(undefined, 'Workflows: ...')).toBe(`${mcpInstructions}\nWorkflows: ...`)
  })

  it('take an app text up to 4,096 characters with the framework\'s, whatever the workflow guide adds', () => {
    expect(mcpServerInstructions('a'.repeat(2691), 'w'.repeat(6000))).toHaveLength(4096 + 1 + 6000)
  })

  it('stop the server on an app text that takes them past 4,096 characters, naming the option', () => {
    expect(() => mcpServerInstructions('a'.repeat(2692), undefined)).toThrow('mcpEndpoint.instructions is 2692 characters, past the 2691 left beside the framework\'s instructions within 4096')
  })
})
