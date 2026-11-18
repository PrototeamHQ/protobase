import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { createErrorHandler } from '../../error-handler'
import { unsubscribeLinks } from './unsubscribe-links'
import { unsubscribeRoutes } from './unsubscribe-routes'
import type { UnsubscribeTarget } from './unsubscribe-token'

const links = unsubscribeLinks({ appUrl: 'https://shop.example.com', path: '/api/unsubscribe', secret: 'test secret' })

const serve = () => {
  const recorded: UnsubscribeTarget[] = []
  const app = new Hono()
  app.onError(createErrorHandler(() => {}))
  app.route('/api/unsubscribe', unsubscribeRoutes(links, async (target) => void recorded.push(target)))
  return { app, recorded }
}

const path = (url: string) => new URL(url).pathname
const ada = path(links.url({ recipient: 'ada@example.com', topic: 'newsletter' }))
const oneClick = (body: string, type = 'application/x-www-form-urlencoded') => ({ method: 'POST', body, headers: { 'content-type': type } })

describe('the unsubscribe endpoint', () => {
  it('records a one-click POST and answers 200', async () => {
    const { app, recorded } = serve()
    const answer = await app.request(ada, oneClick('List-Unsubscribe=One-Click'))
    expect(answer.status).toBe(200)
    expect(await answer.text()).toContain('ada@example.com gets no more newsletter mail')
    expect(recorded).toEqual([{ recipient: 'ada@example.com', topic: 'newsletter' }])
  })

  it('takes the one-click form as multipart too', async () => {
    const { app, recorded } = serve()
    const form = new FormData()
    form.set('List-Unsubscribe', 'One-Click')
    expect((await app.request(ada, { method: 'POST', body: form })).status).toBe(200)
    expect(recorded).toHaveLength(1)
  })

  it('shows a page on GET whose button posts the one-click form, and records nothing', async () => {
    const { app, recorded } = serve()
    const answer = await app.request(ada)
    expect(answer.status).toBe(200)
    expect(answer.headers.get('cache-control')).toBe('no-store')
    const page = await answer.text()
    expect(page).toContain('Stop sending newsletter mail to ada@example.com?')
    expect(page).toContain('<form method="post"><input type="hidden" name="List-Unsubscribe" value="One-Click">')
    expect(recorded).toEqual([])
  })

  it('refuses a token the app did not sign, and a POST without the one-click field, with 400', async () => {
    const { app, recorded } = serve()
    const [payload, signature] = ada.split('/').at(-1)!.split('.')
    const forged = `/api/unsubscribe/${payload}.${signature!.slice(0, -2)}AA`
    expect((await app.request(forged, oneClick('List-Unsubscribe=One-Click'))).status).toBe(400)
    expect((await app.request(forged)).status).toBe(400)
    expect((await app.request(ada, oneClick('List-Unsubscribe=Other'))).status).toBe(400)
    expect((await app.request(ada, oneClick('{}', 'application/json'))).status).toBe(400)
    expect(recorded).toEqual([])
  })

  it('escapes what the token names on its pages', async () => {
    const { app } = serve()
    const page = await (await app.request(path(links.url({ recipient: '<b>@example.com', topic: 'newsletter' })))).text()
    expect(page).not.toContain('<b>@')
    expect(page).toContain('&lt;b&gt;@example.com')
  })
})
