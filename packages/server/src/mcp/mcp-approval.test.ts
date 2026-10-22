import type { ClientCapabilities } from '@modelcontextprotocol/server'
import { describe, expect, it } from 'vitest'
import { ApprovalNeeded, approvalAsked, mcpApproval } from './mcp-approval'

const request = { title: 'Create a record in companies?', body: 'A new customer', fields: [{ label: 'Owner', value: 'Ann' }], code: '{ "name": "Acme" }', approveLabel: 'Create' }
const refusal = { content: [{ type: 'text', text: 'This client cannot ask you to approve a change, so nothing was written; use a client that supports MCP elicitation.' }], isError: true }

describe('mcpApproval', () => {
  it('approves only an accepted answer that ticks approve', async () => {
    expect(await mcpApproval({ approve: { action: 'accept', content: { approve: true } } })(request)).toBe('approved')
  })

  it.each([
    { action: 'decline' },
    { action: 'cancel' },
    { action: 'accept', content: { approve: false } },
    { action: 'accept', content: { approve: 'true' } },
  ])('rejects %j', async (answer) => {
    expect(await mcpApproval({ approve: answer })(request)).toBe('rejected')
  })

  it('needs the approval asked when the call carries no answer', async () => {
    await expect(mcpApproval(undefined)(request)).rejects.toEqual(new ApprovalNeeded(request))
    await expect(mcpApproval({ other: { action: 'accept' } })(request)).rejects.toBeInstanceOf(ApprovalNeeded)
  })
})

describe('approvalAsked', () => {
  it.each<ClientCapabilities>([{ elicitation: {} }, { elicitation: { form: {} } }, { elicitation: { form: {}, url: {} } }])('asks a client with form elicitation, %j', (capabilities) => {
    expect(approvalAsked(request, capabilities)).toEqual({
      resultType: 'input_required',
      inputRequests: {
        approve: {
          method: 'elicitation/create',
          params: expect.objectContaining({
            mode: 'form',
            message: 'Create a record in companies?\n\nA new customer\n\nOwner: Ann\n\n{ "name": "Acme" }',
            requestedSchema: { type: 'object', properties: { approve: { type: 'boolean', title: 'Create' } }, required: ['approve'] },
          }),
        },
      },
    })
  })

  it.each<ClientCapabilities | undefined>([undefined, {}, { elicitation: { url: {} } }])('refuses a client that cannot ask, %j', (capabilities) => {
    expect(approvalAsked(request, capabilities)).toEqual(refusal)
  })
})
