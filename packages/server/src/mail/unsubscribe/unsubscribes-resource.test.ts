import { describe, expect, it } from 'vitest'
import en from '../../../../ui/src/locale/en.json' with { type: 'json' }
import nl from '../../../../ui/src/locale/nl.json' with { type: 'json' }
import { unsubscribesView } from './unsubscribes-resource'

// The admin app translates the view by these keys, so each English one must be the text the server sends.
const view = unsubscribesView.toModel()
const shown = {
  'mail.unsubscribes.names.singular': view.names!.singular,
  'mail.unsubscribes.names.plural': view.names!.plural,
  'mail.unsubscribes.help': view.help,
  ...Object.fromEntries(Object.entries(view.fields).map(([name, hints]) => [`mail.unsubscribes.fields.${name}.label`, hints.label])),
  ...Object.fromEntries(view.layout.map((item, index) => [`mail.unsubscribes.layout.${index}.title`, (item as { title?: string }).title])),
}

describe('the Unsubscribes view', () => {
  it("has each of its texts in the admin app's English and Dutch catalogues", () => {
    const english = en['app/built-in-views'] as Record<string, string>
    const dutch = nl['app/built-in-views'] as Record<string, string>
    for (const [key, text] of Object.entries(shown)) {
      expect(english[key], key).toBe(text)
      expect(dutch[key], key).toBeTypeOf('string')
    }
  })
})
