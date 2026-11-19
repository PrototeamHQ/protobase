import en from './en.json' with { type: 'json' }
import nl from './nl.json' with { type: 'json' }
import { addCatalogue } from './messages'

/** Puts every language's texts in place at once, for what has no screen to wait on a load: workers, tests and stories. */
export const addAllCatalogues = () => {
  addCatalogue('en', en)
  addCatalogue('nl', nl)
}
