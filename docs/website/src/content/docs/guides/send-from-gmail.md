---
title: Send mail from Gmail
description: Set up a Google OAuth client so people link their Gmail on the account page, and send mail with attachments from it in an API function.
---

People of your app link their own Gmail once, on the account page, and your [API functions](/guides/api-functions/) send mail from it, such as an invoice with its PDF attached. This guide sets up the Google side, turns it on in the config and sends a first message. [From someone's own mailbox](/reference/email/#from-someones-own-mailbox) has the details.

## 1. Make the Google OAuth client

In the Google Cloud console, in a project of your own:

1. **Turn on the Gmail API:** APIs & Services → Library → Gmail API → Enable.
2. **Set up the consent screen** (Google Auth Platform → Branding and Audience): the app's name, support address and home page, and the user type **External**, so any Google account can link, not only those of your Workspace.
3. **Add the scope** (Data Access): `https://www.googleapis.com/auth/gmail.send`, beside `openid`, `email` and `profile`. It lets the app send mail as the person and nothing else: it cannot read their mailbox.
4. **Publish the app** (Audience → Publish app), so its publishing status is **In production**. Do not leave it in **Testing**: Google then gives refresh tokens that expire after 7 days, so every link stops working a week after it was made, and sending fails with `link_expired`.
5. **Make the client** (Clients → Create client): type **Web application**, with the authorized redirect URI `<url>/api/auth/callback/google`, such as `https://invoices.example.com/api/auth/callback/google`, and the same path on each of the app's [other origins](/reference/auth/#several-origins) people link from. For local development add `http://localhost:<port>/api/auth/callback/google` too.

Keep the client ID and secret for the next step.

`gmail.send` is a sensitive scope: until Google has verified your app, the consent screen warns that the app is unverified, and at most 100 people can link. Submit the app for verification (Verification Center) before you open it to more.

## 2. Turn it on

Put the client's ID and secret in the app's environment, and name Gmail in `auth.personalMail`. Gmail links through Google sign-in, so `socialProviders` has `google`; it also offers "Continue with Google" on the sign-in page. `encryptOAuthTokens` stores the tokens encrypted with the app's secret:

```sh
# .env
GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

```ts
// protobase.config.ts
export default defineConfig(({ env }) => ({
  auth: {
    socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! } },
    personalMail: ['gmail'],
    encryptOAuthTokens: true,
  },
}))
```

## 3. Link a mailbox

Signed in, open the account page (`/-/account`): under **Mailbox** it offers "Connect Gmail". Google asks which account to use and whether the app may send mail as it, then sends you back to the account page, which now says **Connected**. Someone who already signs in with Google still connects here, as their sign-in did not allow sending mail. The Google account may have another address than the one they sign in with.

## 4. Send from it

A protected function's context has the caller's mailbox as `personalMail`. Send a message with an attachment, and answer a missing or expired link with its own problem, which the function passes on as a `409` with its `code`:

```ts
// functions/send-invoice.ts
import { defineFunction } from '@protobase/server'

export default defineFunction(async (request, { personalMail }) => {
  const { to, number, pdfBase64 } = (await request.json()) as { to: string; number: number; pdfBase64: string }
  await personalMail.send({
    to,
    subject: `Invoice ${number}`,
    text: 'Your invoice is attached.',
    attachments: [{ filename: `invoice-${number}.pdf`, content: Buffer.from(pdfBase64, 'base64'), contentType: 'application/pdf' }],
  })
  return new Response(null, { status: 204 })
})
```

The message goes out from the linked Gmail, and shows in its Sent folder. When the person linked nothing the call answers `409` with `code: "not_linked"`, and when Google no longer honours the link, as after they removed the app from their Google account, `code: "link_expired"`: point them to the account page to connect Gmail again.
