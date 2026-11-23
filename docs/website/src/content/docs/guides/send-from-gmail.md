---
title: Send mail from Gmail
description: Set up a Google OAuth client so people link their Gmail on the account page, and send mail with attachments from it in an API function.
---

People of your app link their own Gmail once, on the account page, and your [API functions](/guides/api-functions/) send mail from it, such as an invoice with its PDF attached. This guide sets up the Google side, turns it on in the config and sends a first message. [From someone's own mailbox](/reference/email/#from-someones-own-mailbox) has the details.

## 1. Make the Google OAuth client

In the Google Cloud console, in a project of your own:

1. **Turn on the Gmail API:** APIs & Services → Library → Gmail API → Enable.
2. **Set up the consent screen** (Google Auth Platform → Branding and Audience): the app's name, support address and home page, and the user type **External**, so any Google account can link, not only those of your Workspace.
3. **Add the scope** (Data Access): `https://www.googleapis.com/auth/gmail.send`, beside `openid`, `email` and `profile`. It lets the app send mail as the person and nothing else: it cannot read their mailbox. Optionally add `https://www.googleapis.com/auth/gmail.settings.basic` too, so the app can read which addresses Gmail sends as ([step 5](#5-send-from-another-address)): it reads the mailbox's settings, not its mail.
4. **Publish the app** (Audience → Publish app), so its publishing status is **In production**. Do not leave it in **Testing**: Google then gives refresh tokens that expire after 7 days, so every link stops working a week after it was made, and sending fails with `link_expired`.
5. **Make the client** (Clients → Create client): type **Web application**, with the authorized redirect URI `<url>/api/auth/callback/google`, such as `https://invoices.example.com/api/auth/callback/google`, and the same path on each of the app's [other origins](/reference/auth/#several-origins) people link from. For local development add `http://localhost:<port>/api/auth/callback/google` too.

Keep the client ID and secret for the next step.

`gmail.send` is a sensitive scope: until Google has verified your app, the consent screen warns that the app is unverified, and at most 100 people can link. Submit the app for verification (Verification Center) before you open it to more.

## 2. Turn it on

Put the client's ID and secret in the app's environment, and name Gmail in `auth.personalMail`. Gmail links through Google sign-in, so `socialProviders` has `google`; it also offers "Continue with Google" on the sign-in page. `encryptOAuthTokens` stores the tokens encrypted with the app's secret, and personal mail needs it:

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

Signed in, open the account page (`/-/account`): under **Mailbox** it offers "Connect Gmail". Google asks which account to use and whether the app may send mail as it, then sends you back to the account page, which now says **Connected**. Someone who already signs in with Google still connects here, as their sign-in did not allow sending mail. The Google account may have another address than the one they sign in with. Once connected, the mailbox offers "Connect Gmail again": with the same Google account it gets a fresh link, and with another one it moves the mailbox to that account, as mail goes out through the account connected last.

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

The message goes out from the linked Gmail, and shows in its Sent folder. When the person linked nothing the call answers `409` with `code: "not_linked"`, and when Google no longer honours the link, as after they removed the app from their Google account, `code: "link_expired"`. An action whose handler calls the function offers to connect Gmail right in its dialog then; mark it `mailbox: true` and it offers that before it runs, while nothing is linked ([Actions that send from someone's mailbox](/reference/ui-config/#actions-that-send-from-someones-mailbox)).

## 5. Send from another address

A Gmail account may send as other addresses of yours, such as a company address beside your own. Gmail sends from your primary address instead, without an error, when an address is not set up under **Send mail as**, so the app keeps each From address with what Gmail says of it.

1. **Set it up in Gmail first:** Gmail's settings → Accounts → **Send mail as** → Add another email address, and confirm it as Gmail asks. An alias of a Google Workspace domain is there already.
2. **Let the app read the list (optional):** add the `gmail.settings.basic` scope to the link, in the config and on the consent screen ([step 1](#1-make-the-google-oauth-client)):

   ```ts
   import { gmailSettingsScope } from '@protobase/server'

   personalMail: [{ provider: 'gmail', scopes: [gmailSettingsScope] }],
   ```

   People who linked Gmail before see **Allow address checks** under **From addresses**, which connects Gmail again with the scope. From then on the account page lists Gmail's send-as addresses as **Verified**, **Awaiting confirmation** or **Can't send**. The app refuses to send from an address Gmail would replace. Without the scope, the app cannot tell, and an address stays **Not checked**.
3. **Add it in the app, if Gmail does not list it:** on the account page, under **Mailbox** → **From addresses**, choose **Add a From address** and type it. Give it the name Gmail shows for it, so mail from the app carries the same name, and a signature of its own if you like, and make it the default to send from it whenever the app names no address.
4. **Name it when sending:** look the address up, then send with its record's id:

   ```ts
   const sender = await personalMail.sender('billing@shop.example')
   await personalMail.send({ sender_address_id: sender.id, to, subject, text })
   ```

The app sends only from the caller's own From addresses and those shared with them: any other is refused before anything is sent. [From addresses](/reference/email/#from-addresses) has the details.

## 6. Sharing a From address

A team's address, such as `billing@shop.example`, can go out through one person's Gmail for the whole team.

1. **Prove it first:** only a **Verified** address can be shared, as Gmail's list or one of the app's [verifiers](/reference/email/#verifying-a-from-address) says.
2. **Share it:** on the account page, under **From addresses**, choose **Edit** on the address, turn on **Share with the app's other senders**, and save. It shows **Shared**.
3. **Your colleagues pick it:** it shows in their From dropdowns after their own addresses, marked **shared**, and `personalMail.sender('billing@shop.example')` finds it for them. With organizations on, only people in an organization with you see it. They never see your own address or mailbox.

Mail they send from it goes out through your Gmail, so it lands in your **Sent** folder. It stops going out the moment you unshare or remove it, it is no longer verified, or your Gmail link expires: then they are told you must connect Gmail again. [Sharing a From address](/reference/email/#sharing-a-from-address) has the details.
