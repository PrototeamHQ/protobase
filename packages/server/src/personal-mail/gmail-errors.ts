// Google's standard error body, as the Gmail API answers a refusal.

export type GmailError = { status?: string; message?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] }

// Google's standard error body, read once; a body that is not JSON names nothing.
export const gmailError = async (response: Response): Promise<GmailError | undefined> => {
  if (!response.headers.get('content-type')?.includes('json')) return
  const text = await response.text()
  try {
    return (JSON.parse(text) as { error?: GmailError }).error
  } catch (error) {
    if (error instanceof SyntaxError) return
    throw error
  }
}

// Google's error body names the reason in `errors[].reason`, or in `details[].reason` (`ACCESS_TOKEN_SCOPE_INSUFFICIENT`).
export const gmailReason = (error: GmailError | undefined) => {
  const reasons = [...(error?.errors ?? []), ...(error?.details ?? [])].map((entry) => entry.reason)
  return reasons.includes('insufficientPermissions') || reasons.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ? 'insufficientPermissions' : reasons[0]
}

// Only what Google says about the refusal, such as ` FAILED_PRECONDITION (failedPrecondition: Precondition check failed.)`.
export const gmailCause = (error: GmailError | undefined) => {
  if (!error) return ''
  const reason = error.errors?.[0]?.reason
  const detail = [reason, error.message].filter(Boolean).join(': ')
  return `${error.status ? ` ${error.status}` : ''}${detail ? ` (${detail})` : ''}`
}
