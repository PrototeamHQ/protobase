import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { slotted } from './slotted'

describe('slotted', () => {
  it('puts the element where the text has {}', () => {
    expect(renderToStaticMarkup(slotted('Sent to {}, once.', createElement('b', null, 'ann@example.com')))).toBe('Sent to <b>ann@example.com</b>, once.')
  })

  it('fails on a text without a place for the element', () => {
    expect(() => slotted('Sent', null)).toThrow()
  })
})
