// Gmail API answers in the shapes its reference documents: a sent message is a `Message` resource, and an error is
// Google's standard error body, here for an access token that is no longer valid, for one without the send scope, for a
// Google account without Gmail, for a malformed To header and for a project without the Gmail API enabled.

export const sentMessage = { id: '18f2c0a9b4e1d7c3', threadId: '18f2c0a9b4e1d7c3', labelIds: ['SENT'] }

export const invalidCredentials = {
  error: {
    code: 401,
    message: 'Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential.',
    errors: [{ message: 'Invalid Credentials', domain: 'global', reason: 'authError', location: 'Authorization', locationType: 'header' }],
    status: 'UNAUTHENTICATED',
  },
}

export const insufficientScope = {
  error: {
    code: 403,
    message: 'Request had insufficient authentication scopes.',
    errors: [{ message: 'Insufficient Permission', domain: 'global', reason: 'insufficientPermissions' }],
    status: 'PERMISSION_DENIED',
    details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', domain: 'googleapis.com' }],
  },
}

// Gmail's real answer to a send from a Google account that has no Gmail mailbox.
export const preconditionFailed = {
  error: {
    code: 400,
    message: 'Precondition check failed.',
    errors: [{ message: 'Precondition check failed.', domain: 'global', reason: 'failedPrecondition' }],
    status: 'FAILED_PRECONDITION',
  },
}

export const invalidToHeader = {
  error: {
    code: 400,
    message: 'Invalid To header',
    errors: [{ message: 'Invalid To header', domain: 'global', reason: 'invalidArgument' }],
    status: 'INVALID_ARGUMENT',
  },
}

export const accessNotConfigured = {
  error: {
    code: 403,
    message: 'Gmail API has not been used in project 123456789012 before or it is disabled.',
    errors: [{ message: 'Gmail API has not been used in project 123456789012 before or it is disabled.', domain: 'usageLimits', reason: 'accessNotConfigured' }],
    status: 'PERMISSION_DENIED',
  },
}

export const json = (body: unknown, status = 200, statusText = '') => new Response(JSON.stringify(body), { status, statusText, headers: { 'content-type': 'application/json; charset=UTF-8' } })
