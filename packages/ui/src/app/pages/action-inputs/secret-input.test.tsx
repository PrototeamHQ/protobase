import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SecretInput } from './secret-input'

describe('SecretInput', () => {
  it('is a text input drawn as discs that browsers and password managers leave alone', () => {
    const html = renderToStaticMarkup(<SecretInput name="api_key" value="" invalid={false} onChange={() => undefined} />)
    expect(html).toContain('type="text"')
    expect(html).not.toContain('type="password"')
    expect(html).toContain('-webkit-text-security:disc')
    for (const attribute of ['autoComplete="off"', 'autoCorrect="off"', 'autoCapitalize="off"', 'spellCheck="false"', 'data-1p-ignore="true"', 'data-lpignore="true"', 'data-bwignore="true"', 'data-form-type="other"', 'data-gramm="false"']) {
      expect(html.toLowerCase()).toContain(attribute.toLowerCase())
    }
  })
})
