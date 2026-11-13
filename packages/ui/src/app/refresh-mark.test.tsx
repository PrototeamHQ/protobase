import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RefreshMark } from './refresh-mark'

const status = (html: string) => html.match(/<span role="status"[^>]*>([^<]*)<\/span>/)?.[1]

describe('the mark beside the title of a page drawn from the start cache', () => {
  it('says it is refreshing in a status region', () => {
    expect(status(renderToStaticMarkup(<RefreshMark failed={false} />))).toBe('Refreshing')
  })

  it('says the refresh failed in the same status region', () => {
    expect(status(renderToStaticMarkup(<RefreshMark failed />))).toBe('Could not refresh. This is what the app last loaded.')
  })
})
