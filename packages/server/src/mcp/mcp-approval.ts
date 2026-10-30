import { inputRequired, inputResponse, type CallToolResult, type ClientCapabilities, type InputRequiredResult } from '@modelcontextprotocol/server'
import type { Locale } from '@protobase/schema/internal'
import type { ApprovalAnswer, ApprovalRequest } from '../assistant/approval'
import { messages } from '../locale/messages'
import type { AskedApproval } from './mcp-approval-store'

/** Thrown by `approve` over MCP when the request carries no answer yet: the server then asks the client for one. */
export class ApprovalNeeded extends Error {
  constructor(readonly request: ApprovalRequest) {
    super('The user has not answered the approval yet')
  }
}

/** The key of the answer to the approval asked with `nonce`: an answer filed under any other counts for nothing. */
export const approvalKey = (nonce: string) => `approve-${nonce}`

export type McpApprovalInput = {
  inputResponses: Record<string, unknown> | undefined
  /** The `requestState` the call echoes, as the client sent it. */
  requestState: unknown
  /** Takes `state` back for this call (see `McpApprovals.check`): its nonce, or `undefined` when it does not count. */
  check: (state: unknown) => Promise<string | undefined>
}

/**
 * `ToolContext.approve` over MCP, from the answer a retried call carries to the approval asked for that very call:
 * `ApprovalNeeded` when it carries no state that counts, or no answer under that state's key; approved only when the
 * user accepted and ticked `approve`; rejected on any other answer.
 */
export const mcpApproval = ({ inputResponses, requestState, check }: McpApprovalInput) => async (request: ApprovalRequest): Promise<ApprovalAnswer> => {
  if (requestState === undefined) throw new ApprovalNeeded(request)
  const nonce = await check(requestState)
  if (nonce === undefined) throw new ApprovalNeeded(request)
  const answer = inputResponse(inputResponses, approvalKey(nonce))
  if (answer.kind === 'missing') throw new ApprovalNeeded(request)
  if (answer.kind === 'elicit' && answer.action === 'accept' && answer.content?.approve === true) return 'approved'
  return 'rejected'
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

const text = messages('mcp/approval')

const cannotAsk = (locale: Locale): CallToolResult => ({ content: [{ type: 'text', text: text(locale)('cannotAsk') }], isError: true })

/**
 * The answer to a call whose tool asked for approval: a form asking the user to approve `request` when the client can
 * show one, filed under the nonce of the state `ask` mints for the call, else a refusal in `locale`. A 2025-protocol
 * request declares no capabilities per request, so it is always refused.
 */
export const approvalAsked = async (request: ApprovalRequest, capabilities: ClientCapabilities | undefined, ask: () => Promise<AskedApproval>, locale: Locale = 'en'): Promise<CallToolResult | InputRequiredResult> => {
  if (!asksForms(capabilities)) return cannotAsk(locale)
  const { state, nonce } = await ask()
  return inputRequired({
    inputRequests: {
      [approvalKey(nonce)]: inputRequired.elicit({
        message: messageOf(request),
        requestedSchema: { type: 'object', properties: { approve: { type: 'boolean', title: request.approveLabel ?? text(locale)('approve') } }, required: ['approve'] },
      }),
    },
    requestState: state,
  })
}
