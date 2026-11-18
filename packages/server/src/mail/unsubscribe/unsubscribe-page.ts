import { html } from 'hono/html'
import type { UnsubscribeTarget } from './unsubscribe-token'

const page = (title: string, body: ReturnType<typeof html>) => html`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5">
${body}
</body>
</html>`

/**
 * The page a link opened in a browser shows: what it unsubscribes, and a button that posts the one-click form to the
 * same address. Opening the link changes nothing, so a scanner that follows links in mail unsubscribes no one.
 */
export const confirmPage = ({ recipient, topic }: UnsubscribeTarget) =>
  page(
    'Unsubscribe',
    html`<h1>Unsubscribe</h1>
<p>Stop sending ${topic} mail to ${recipient}?</p>
<form method="post"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit">Unsubscribe</button></form>`,
  )

/** The page after the unsubscribe was recorded. */
export const donePage = ({ recipient, topic }: UnsubscribeTarget) =>
  page('Unsubscribed', html`<h1>Unsubscribed</h1>
<p>${recipient} gets no more ${topic} mail.</p>`)
