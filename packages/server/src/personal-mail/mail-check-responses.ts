// The mail check service's answers, in the shapes its contract gives (`mailCheckService`): a one-time address with its
// token, and a token's result before its message arrived and after. Written by hand until the service is live; record
// them from it then.

export const token = 'cebqaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

export const issued = { token, address: `${token}@bounces.protobase.example` }

export const notReceived = { received: false }

export const receivedFrom = (from: string) => ({ received: true, from })

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
