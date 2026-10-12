import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// The token contract: a project's protobase.theme.css and every plugin's utilities read these, so a release adds tokens
// and never takes one away; a renamed token keeps its old name too.
const pinned = [
  '--background', '--surface', '--muted', '--border', '--border-strong', '--foreground', '--muted-foreground', '--faint-foreground',
  '--primary', '--primary-hover', '--primary-foreground', '--primary-soft', '--primary-border', '--primary-text',
  '--success', '--success-soft', '--success-text', '--warning', '--warning-soft', '--warning-text',
  '--danger', '--danger-soft', '--danger-text', '--violet', '--violet-soft', '--violet-text',
  '--sidebar', '--shadow-pop', '--radius', '--font', '--font-code',
]

const declared = (selector: string) => {
  const css = readFileSync(path.join(import.meta.dirname, 'tokens.css'), 'utf8')
  const block = css.slice(css.indexOf(`${selector} {`), css.indexOf('}', css.indexOf(`${selector} {`)))
  return [...block.matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name!)
}

describe('the tokens', () => {
  it('keeps every token a theme may set, with a light value', () => {
    expect(pinned.filter((name) => !declared(':root').includes(name))).toEqual([])
  })

  it('pins every token it has, so the theme reference lists it', () => {
    expect(declared(':root').filter((name) => !pinned.includes(name))).toEqual([])
  })

  it('gives dark values only for tokens it has', () => {
    expect(declared('[data-theme="dark"]').filter((name) => !pinned.includes(name))).toEqual([])
  })
})
