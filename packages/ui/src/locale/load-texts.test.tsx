import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Each test imports the texts afresh, with no language loaded, as the app starts; the setup's catalogues stay with the
// modules imported before.
beforeEach(() => vi.resetModules())

const fresh = async () => ({ ...(await import('./active-locale')), ...(await import('./messages')), ...(await import('./texts-gate')) })

describe('loadTexts', () => {
  it("loads a language's texts when asked, and no other language's", async () => {
    const { loadTexts, messages, setFallbackLocale, textsLoaded } = await fresh()
    setFallbackLocale('nl')
    expect(() => messages('compact-table')('noRows')).toThrow("The nl texts are not loaded: await loadTexts('nl') first")
    await loadTexts('nl')
    expect(messages('compact-table')('noRows')).toBe('Geen rijen.')
    expect(textsLoaded('en')).toBe(false)
  })

  it('loads a language once, however often it is asked', async () => {
    const { loadTexts } = await fresh()
    expect(loadTexts('en')).toBe(loadTexts('en'))
    await loadTexts('en')
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
