import { addAllCatalogues } from '../packages/ui/src/locale/all-catalogues'

// Setup for the unit and snapshot tests: the admin app's texts in every language, which the app loads one language at a time
// before it draws, so a test can draw a screen or read a text in any of them at once.
addAllCatalogues()
