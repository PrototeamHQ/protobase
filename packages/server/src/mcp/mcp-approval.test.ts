import type { ClientCapabilities } from '@modelcontextprotocol/server'
import { describe, expect, it, vi } from 'vitest'
import { ApprovalNeeded, approvalAsked, approvalKey, mcpApproval, writesUnasked } from './mcp-approval'

const request = { title: 'Create a record in companies?', body: 'A new customer', fields: [{ label: 'Owner', value: 'Ann' }], code: '{ "name": "Acme" }', approveLabel: 'Create' }
const refusal = { content: [{ type: 'text', text: 'This client cannot ask you to approve a change, so nothing was written; use a client that supports MCP elicitation.' }], isError: true }

describe('mcpApproval', () => {
  const nonce = 'n1'
  const answered = (answer: unknown, check = vi.fn(async () => nonce as string | undefined)) => ({ approve: mcpApproval({ inputResponses: { [approvalKey(nonce)]: answer }, requestState: 'state', check }), check })

  it('approves only an accepted answer that ticks approve, under the key of the state that counts', async () => {
    const { approve, check } = answered({ action: 'accept', content: { approve: true } })
    expect(await approve(request)).toBe('approved')
    expect(check).toHaveBeenCalledWith('state')
  })

  it.each([
    { action: 'decline' },
    { action: 'decline', content: { approve: true } },
    { action: 'cancel' },
    { action: 'accept' },
    { action: 'accept', content: { approve: false } },
    { action: 'accept', content: { approve: 'true' } },
    { action: 'accept', content: { approve: 1 } },
  ])('rejects %j, after taking its state', async (answer) => {
    const { approve, check } = answered(answer)
    expect(await approve(request)).toBe('rejected')
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('asks again for an accept when the state does not count', async () => {
    const { approve } = answered({ action: 'accept', content: { approve: true } }, vi.fn(async () => undefined))
    await expect(approve(request)).rejects.toEqual(new ApprovalNeeded(request))
  })

  it('asks when the call carries no state, without checking one', async () => {
    const check = vi.fn(async () => nonce)
    await expect(mcpApproval({ inputResponses: { [approvalKey(nonce)]: { action: 'accept', content: { approve: true } } }, requestState: undefined, check })(request)).rejects.toBeInstanceOf(ApprovalNeeded)
    expect(check).not.toHaveBeenCalled()
  })

  it('asks again for an answer filed under any other key than its state\'s', async () => {
    const accept = { action: 'accept', content: { approve: true } }
    for (const inputResponses of [undefined, {}, { approve: accept }, { [approvalKey('other')]: accept }, { [approvalKey(nonce)]: 'accept' }]) {
      await expect(mcpApproval({ inputResponses, requestState: 'state', check: async () => nonce })(request)).rejects.toBeInstanceOf(ApprovalNeeded)
    }
  })
})

describe('approvalAsked', () => {
  const ask = vi.fn(async () => ({ state: 'v1.state.mac', nonce: 'n1' }))

  it.each<ClientCapabilities>([{ elicitation: {} }, { elicitation: { form: {} } }, { elicitation: { form: {}, url: {} } }])('asks a client with form elicitation, %j, under the nonce of the state it mints', async (capabilities) => {
    expect(await approvalAsked(request, capabilities, ask)).toEqual({
      resultType: 'input_required',
      requestState: 'v1.state.mac',
      inputRequests: {
        'approve-n1': {
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

  it.each<ClientCapabilities | undefined>([undefined, {}, { elicitation: { url: {} } }])('refuses a client that cannot ask, %j, minting nothing', async (capabilities) => {
    ask.mockClear()
    expect(await approvalAsked(request, capabilities, ask)).toEqual(refusal)
    expect(ask).not.toHaveBeenCalled()
  })
})

describe('writesUnasked', () => {
  it('holds for a user with any of the named roles', () => {
    expect(writesUnasked(['service'], ['sales', 'service'])).toBe(true)
  })

  it('matches exactly, and only a list of roles', () => {
    for (const roles of [['Service'], ['service '], ['services'], ['serv'], ['service-reader'], ['__proto__'], ['constructor'], ['toString'], ['admin'], [], null, undefined, 'service', { service: true }]) {
      expect(writesUnasked(['service'], roles)).toBe(false)
    }
  })

  it('holds for nobody when no role is named', () => {
    expect(writesUnasked([], ['service', 'admin'])).toBe(false)
  })
})
