import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { splashColors } from './splash-colors'

let dir = ''
beforeEach(() => void (dir = mkdtempSync(path.join(tmpdir(), 'protobase-splash-colors-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const theme = (css: string) => writeFileSync(path.join(dir, 'protobase.theme.css'), css)

describe('splashColors', () => {
  it('is the installed UI\'s background for an app without a theme', async () => {
    expect(await splashColors(dir)).toEqual({ light: '#ffffff', dark: '#0f0f11' })
  })

  it('reads the UI\'s tokens inside their layer', async () => {
    const tokens = path.join(dir, 'tokens.css')
    writeFileSync(tokens, '@layer base { :root { --background: #fafafa; --muted: #eee } [data-theme="dark"] { --background: #101010 } }')
    expect(await splashColors(dir, tokens)).toEqual({ light: '#fafafa', dark: '#101010' })
  })

  it('takes the theme\'s light and dark background, in any sRGB notation', async () => {
    theme(':root { --background: rgb(244 243 238) }\n[data-theme="dark"] { --background: hsl(0 0% 0%) }')
    expect(await splashColors(dir)).toEqual({ light: '#f4f3ee', dark: '#000000' })
    theme(':root { --background: white }\n[data-theme="dark"] { --background: #111216 }')
    expect(await splashColors(dir)).toEqual({ light: '#ffffff', dark: '#111216' })
  })

  it('uses a background the theme sets on :root only in dark mode too, as the app does', async () => {
    theme(':root { --background: #f4f3ee; --primary: #ea580c }')
    expect(await splashColors(dir)).toEqual({ light: '#f4f3ee', dark: '#f4f3ee' })
  })

  it('lets an !important background win over a later one', async () => {
    theme(':root { --background: #123456 !important }\n:root { --background: #ffffff }\n[data-theme="dark"] { --background: #111216 }')
    expect(await splashColors(dir)).toEqual({ light: '#123456', dark: '#111216' })
  })

  it('keeps the UI\'s light background when the theme sets only dark', async () => {
    theme('[data-theme="dark"] { --background: #111216 }')
    expect(await splashColors(dir)).toEqual({ light: '#ffffff', dark: '#111216' })
  })

  it('keeps the UI\'s background for a theme that sets other tokens only', async () => {
    theme(':root { --primary: #ea580c }\n[data-theme="dark"] { --primary: #f97316 }')
    expect(await splashColors(dir)).toEqual({ light: '#ffffff', dark: '#0f0f11' })
  })

  it('fails on a background a native colour cannot take, naming the theme', async () => {
    for (const value of ['oklch(0.98 0.01 90)', '#f4f3ee80', 'var(--paper)', 'notacolor']) {
      theme(`:root { --background: ${value} }`)
      await expect(splashColors(dir)).rejects.toThrow('protobase.theme.css: the native splash screen needs --background as an opaque sRGB colour')
    }
  })
})
