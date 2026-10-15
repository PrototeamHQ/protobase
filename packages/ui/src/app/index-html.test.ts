import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'

// A phone's browser counts 100vh with its toolbars hidden, so a root of that height is taller than the screen shows
// while they are in view: the bottom bar of a page that fills the root, such as a map, sits under the toolbar, and the
// document scrolls besides the page. Storybook's phone sizes have no toolbars, so its stories cannot show this.
it('sizes the root to what the screen shows', () => {
  const html = readFileSync(path.join(import.meta.dirname, 'index.html'), 'utf8')
  const root = /<div id="root" class="([^"]*)"/.exec(html)?.[1]?.split(' ')
  expect(root).toContain('h-dvh')
  expect(root).not.toContain('h-screen')
})
