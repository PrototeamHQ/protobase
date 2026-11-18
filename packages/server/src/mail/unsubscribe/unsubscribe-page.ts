import { html } from 'hono/html'
import type { Locale } from '@protobase/schema/internal'
import { messages } from '../../locale/messages'
import type { UnsubscribeTarget } from './unsubscribe-token'

const texts = messages('mail/unsubscribe')

const page = (locale: Locale, title: string, body: ReturnType<typeof html>) => html`<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5">
${body}
</body>
</html>`

/**
 * The page a link opened in a browser shows, in `locale`: what it unsubscribes, and a button that posts the one-click
 * form to the same address. Opening the link changes nothing, so a scanner that follows links in mail unsubscribes no one.
 */
export const confirmPage = (target: UnsubscribeTarget, locale: Locale) => {
  const text = texts(locale)
  return page(
    locale,
    text('title'),
    html`<h1>${text('title')}</h1>
<p>${text('question', target)}</p>
<form method="post"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit">${text('button')}</button></form>`,
  )
}

/** The page after the unsubscribe was recorded, in `locale`. */
export const donePage = (target: UnsubscribeTarget, locale: Locale) => {
  const text = texts(locale)
  return page(locale, text('doneTitle'), html`<h1>${text('doneTitle')}</h1>
<p>${text('done', target)}</p>`)
}
