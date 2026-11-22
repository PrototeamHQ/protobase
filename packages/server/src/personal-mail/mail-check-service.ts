import * as z from 'zod'
import { mailCheckHeaders } from './mail-check-signing'
import type { MailCheckSettings } from './mail-check-settings'

/** The calls of the mail check service, under the URL the platform names. */
export const mailCheckPaths = (url: string) => ({
  issue: `${url}/alias-checks`,
  result: `${url}/alias-checks/result`,
})

const issued = z.object({ token: z.string().min(1), address: z.email() })
const result = z.union([z.object({ received: z.literal(false) }), z.object({ received: z.literal(true), from: z.string().min(1) })])

/**
 * The service that receives a check's test message at a one-time address and reads the From it arrived with:
 * `issue` gives a new one-time address and its token, `received` the address in the From header the message for a
 * token arrived with, or nothing while none has arrived. Each call is a POST of JSON, signed (`mailCheckHeaders`).
 */
export type MailCheckService = {
  issue: () => Promise<{ token: string; address: string }>
  received: (token: string) => Promise<string | undefined>
}

export const mailCheckService = ({ url, platformSecret }: MailCheckSettings, fetcher: typeof fetch = (...args) => fetch(...args)): MailCheckService => {
  const paths = mailCheckPaths(url)
  const call = async (path: string, payload: object) => {
    const body = JSON.stringify(payload)
    const headers = await mailCheckHeaders(platformSecret, crypto.randomUUID(), body)
    const response = await fetcher(path, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body })
    if (!response.ok) throw new Error(`The mail check service answered ${response.status} ${response.statusText} to ${path}`)
    return response.json() as Promise<unknown>
  }
  return {
    issue: async () => issued.parse(await call(paths.issue, {})),
    received: async (token) => {
      const answer = result.parse(await call(paths.result, { token }))
      return answer.received ? answer.from : undefined
    },
  }
}
