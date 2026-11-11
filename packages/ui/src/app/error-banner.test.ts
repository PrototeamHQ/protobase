import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ErrorBanner } from './error-banner'

const render = (onRetry?: () => void) => renderToStaticMarkup(createElement(ErrorBanner, { title: 'Could not load', error: new Error('offline'), onRetry }))

describe('ErrorBanner', () => {
  it('offers Try again when it can retry', () => {
    expect(render(() => {})).toContain('>Try again</button>')
  })

  it('shows no button without a retry', () => {
    expect(render()).not.toContain('<button')
  })
})
