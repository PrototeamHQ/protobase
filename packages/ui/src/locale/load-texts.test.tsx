import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Each test imports the texts afresh, with no language loaded, as the app starts; the setup's catalogues stay with the
// modules imported before.
beforeEach(() => vi.resetModules())

const fresh = async () => ({ ...(await import('./active-locale')), ...(await import('./messages')), ...(await import('./texts-gate')), ...(await import('../auth/code-form')) })

describe('loadTexts', () => {
  it("loads a language's texts when asked, and no other language's", async () => {
    const { loadTexts, messages, setFallbackLocale, textsLoaded } = await fresh()
    setFallbackLocale('nl')
    expect(() => messages('compact-table')('noRows')).toThrow("The nl texts are not loaded: await loadTexts('nl') first")
    await loadTexts('nl')
    expect(messages('compact-table')('noRows')).toBe('Geen rijen.')
    expect(textsLoaded('en')).toBe(false)
  })

  it('keeps a load that failed failed, rather than asking again on every draw', async () => {
    vi.doMock('./nl.json', () => {
      throw new Error('offline')
    })
    const { loadTexts } = await fresh()
    const first = loadTexts('nl')
    await expect(first).rejects.toThrow()
    expect(loadTexts('nl')).toBe(first)
    vi.doUnmock('./nl.json')
  })

  it('loads a language once, however often it is asked', async () => {
    const { loadTexts } = await fresh()
    expect(loadTexts('en')).toBe(loadTexts('en'))
    await loadTexts('en')
  })
})

describe('showTextsIn', () => {
  it("draws the app's pieces outside the app in the language it loaded, with no other language loaded", async () => {
    const { CodeForm, showTextsIn, textsLoaded } = await fresh()
    await showTextsIn('nl')
    const noop = () => undefined
    const form = <CodeForm title="Inloggen" explanation="" submitLabel="Verder" onSubmit={noop} onResend={noop} onChangeAddress={noop} changeAddressLabel="Ander adres" />
    // Drawn in English, whose texts are not loaded, the form would throw
    expect(renderToStaticMarkup(form)).toContain('Code')
    expect(textsLoaded('en')).toBe(false)
  })
})

describe('TextsGate', () => {
  it("draws nothing until the language's texts are loaded, then what it holds", async () => {
    const { loadTexts, messages, TextsGate } = await fresh()
    const Text = () => <p>{messages('compact-table')('noRows')}</p>
    const gate = (
      <TextsGate locale="en">
        <Text />
      </TextsGate>
    )
    expect(renderToStaticMarkup(gate)).toBe('')
    await loadTexts('en')
    expect(renderToStaticMarkup(gate)).toBe('<p>No rows.</p>')
  })
})
