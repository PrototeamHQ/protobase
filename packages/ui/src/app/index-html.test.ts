import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'
import { startScreenId } from './start-screen'

// A phone's browser counts 100vh with its toolbars hidden, so a root of that height is taller than the screen shows
// while they are in view: the bottom bar of a page that fills the root, such as a map, sits under the toolbar, and the
// document scrolls besides the page. Storybook's phone sizes have no toolbars, so its stories cannot show this.
it('sizes the root to what the screen shows', () => {
  const html = readFileSync(path.join(import.meta.dirname, 'index.html'), 'utf8')
  const root = /<div id="root" class="([^"]*)"/.exec(html)?.[1]?.split(' ')
  expect(root).toContain('h-dvh')
  expect(root).not.toContain('h-screen')
})

// The start screen draws before tokens.css loads, so it names their light and dark values itself as the fallbacks
it("starts in the theme's own colours, light and dark", () => {
  const html = readFileSync(path.join(import.meta.dirname, 'index.html'), 'utf8')
  const tokens = readFileSync(path.join(import.meta.dirname, '..', 'tokens.css'), 'utf8')
  const [light, dark] = tokens.split('[data-theme="dark"]')
  const token = (block: string | undefined, name: string) => new RegExp(`--${name}: (#[0-9a-f]+);`).exec(block ?? '')?.[1]
  const fallbacks = (name: string) => [...html.matchAll(new RegExp(`var\\(--${name}, (#[0-9a-f]+)\\)`, 'g'))].map((match) => match[1])
  expect(fallbacks('background')).toEqual([token(light, 'background'), token(dark, 'background')])
  expect(fallbacks('muted-foreground')).toEqual([token(light, 'muted-foreground'), token(dark, 'muted-foreground')])
  expect(html).toContain(`<div id="${startScreenId}"`)
})
