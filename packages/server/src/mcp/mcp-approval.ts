import { inputRequired, inputResponse, type CallToolResult, type ClientCapabilities, type InputRequiredResult } from '@modelcontextprotocol/server'
import type { ApprovalAnswer, ApprovalRequest } from '../assistant/approval'

/** Thrown by `approve` over MCP when the request carries no answer yet: the server then asks the client for one. */
export class ApprovalNeeded extends Error {
  constructor(readonly request: ApprovalRequest) {
    super('The user has not answered the approval yet')
  }
}

/**
 * `ToolContext.approve` over MCP, from the answers a retried call carries: approved only when the user accepted and
 * ticked `approve`, rejected on any other answer, and `ApprovalNeeded` when there is none yet.
 */
export const mcpApproval = (inputResponses: Record<string, unknown> | undefined) => (request: ApprovalRequest): Promise<ApprovalAnswer> => {
  const answer = inputResponse(inputResponses, 'approve')
  if (answer.kind === 'missing') return Promise.reject(new ApprovalNeeded(request))
  if (answer.kind === 'elicit' && answer.action === 'accept' && answer.content?.approve === true) return Promise.resolve('approved')
  return Promise.resolve('rejected')
}

/**
 * Whether `roles`, the roles the signed-in user holds, include one of `exempt`, whose MCP writes need no approval: an
 * exact match, and none for anything but a list.
 */
export const writesUnasked = (exempt: readonly string[], roles: unknown) => Array.isArray(roles) && roles.some((role) => exempt.includes(role))

/** `ToolContext.approve` over MCP for a user whose writes need no approval: approved, without asking the client. */
export const approvedUnasked = (): Promise<ApprovalAnswer> => Promise.resolve('approved')

// The SDK's rule: `elicitation: {}` means form support, as does `elicitation.form`; `elicitation.url` alone does not.
const asksForms = (capabilities: ClientCapabilities | undefined) => {
  const elicitation = capabilities?.elicitation
  return elicitation !== undefined && (elicitation.form !== undefined || elicitation.url === undefined)
}

const messageOf = (request: ApprovalRequest) =>
  [request.title, request.body, request.fields?.map(({ label, value }) => `${label}: ${value}`).join('\n'), request.code].filter(Boolean).join('\n\n')

const cannotAsk: CallToolResult = {
  content: [{ type: 'text', text: 'This client cannot ask you to approve a change, so nothing was written; use a client that supports MCP elicitation.' }],
  isError: true,
}

/**
 * The answer to a call whose tool asked for approval: a form asking the user to approve `request` when the client can
 * show one, else a refusal. A 2025-protocol request declares no capabilities per request, so it is always refused.
 */
export const approvalAsked = (request: ApprovalRequest, capabilities: ClientCapabilities | undefined): CallToolResult | InputRequiredResult => {
  if (!asksForms(capabilities)) return cannotAsk
  return inputRequired({
    inputRequests: {
      approve: inputRequired.elicit({
        message: messageOf(request),
        requestedSchema: { type: 'object', properties: { approve: { type: 'boolean', title: request.approveLabel ?? 'Approve' } }, required: ['approve'] },
      }),
    },
  })
}
