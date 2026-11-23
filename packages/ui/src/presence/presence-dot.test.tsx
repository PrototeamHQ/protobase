import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PresenceDot } from './presence-dot'

describe('PresenceDot', () => {
  it('names offline from the locale and draws it as an empty ring, apart from online and away', () => {
    const offline = renderToStaticMarkup(<PresenceDot presence="offline" />)
    expect(offline).toContain('aria-label="Offline"')
    expect(offline).toContain('data-tone="neutral"')
    expect(renderToStaticMarkup(<PresenceDot presence="away" />)).toContain('data-tone="warning"')
    expect(renderToStaticMarkup(<PresenceDot presence="online" />)).toContain('data-tone="success"')
  })
})
