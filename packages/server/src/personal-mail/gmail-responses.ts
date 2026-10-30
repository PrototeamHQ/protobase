// Gmail API answers in the shapes its reference documents: a sent message is a `Message` resource, and an error is
// Google's standard error body, here for an access token that is no longer valid and for one without the send scope.

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

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=UTF-8' } })
