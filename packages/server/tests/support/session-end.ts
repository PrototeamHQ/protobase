import { expect } from 'vitest'
import type { MailMessage } from '../../src/mail/smtp-mailer'
import { browser, origin, pushTo, type serve } from './notifications-app'
import { sessionCookie } from './session-token'

// The session-end tests, split over files so each recording stays small: a device gets no push and is removed once
// the session it was registered in ends.

export const describedAs = 'a device with auth, once the session it was registered in ends'

// The session token a cookie header carries, whose value is `token.signature`.
export const tokenIn = (cookie: string) => decodeURIComponent(cookie.split('; ').find((part) => part.startsWith(`${sessionCookie}=`))!.slice(sessionCookie.length + 1)).split('.')[0]!

// Auth sends its mail after the response, so `last` waits on the send itself rather than polling for it.
export const recordingMailer = () => {
  const sent: MailMessage[] = []
  const waiting: { to: string; resolve: (text: string) => void }[] = []
  const send = async (message: MailMessage) => {
    sent.push(message)
    for (const waiter of waiting.filter((waiter) => waiter.to === message.to)) waiter.resolve(message.text)
  }
  const last = (to: string) => {
    const earlier = sent.findLast((message) => message.to === to)
    if (earlier) return Promise.resolve(earlier.text)
    return new Promise<string>((resolve) => waiting.push({ to, resolve }))
  }
  return { last, mailer: { send } }
}

// Alice signed in on two browsers, each registered in its own session, and Bob on one: each gets push to begin with.
export const signedIn = async (served: Awaited<ReturnType<typeof serve>>) => {
  const { alice, bob, app, cookieOf, register } = served
  const bearerOf = async (cookie: string) => ((await (await app.request(`${origin}/api/auth/token`, { headers: { cookie, origin } })).json()) as { token: string }).token
  const first = await cookieOf('alice@example.com')
  const second = await cookieOf('alice@example.com')
  const bobs = await cookieOf('bob@example.com')
  for (const [cookie, name] of [[first, 'alice-1'], [second, 'alice-2'], [bobs, 'bob-1']] as const) expect((await register(await bearerOf(cookie), browser(name))).status).toBe(200)
  expect(await pushTo(served, alice.id)).toEqual(['alice-1', 'alice-2'])
  expect(await pushTo(served, bob.id)).toEqual(['bob-1'])
  return { first, second, bobs, bearerOf }
}

export const endpoints = async (served: Awaited<ReturnType<typeof serve>>, userId: string) => (await served.devicesOf(userId)).map(({ token }) => token.slice(token.lastIndexOf('/') + 1))

// After a session ends: Alice's devices left get push, the ended ones are removed, and Bob's are untouched.
export const expectLeft = async (served: Awaited<ReturnType<typeof serve>>, left: string[]) => {
  expect(await pushTo(served, served.alice.id)).toEqual(left)
  expect(await endpoints(served, served.alice.id)).toEqual(left)
  expect(await pushTo(served, served.bob.id)).toEqual(['bob-1'])
}
