import { describe, expect, it } from 'vitest'
import { compileTheme, themeTokens } from './theme'

const known = new Set(['--primary', '--radius', '--font'])

describe('themeTokens', () => {
  it("reads the tokens of the app's stylesheet, colors, radius and fonts", async () => {
    const tokens = await themeTokens()
    for (const name of ['--background', '--primary', '--primary-foreground', '--danger-text', '--sidebar', '--shadow-pop', '--radius', '--font', '--font-code']) expect(tokens).toContain(name)
  })
})

describe('compileTheme', () => {
  it('minifies token values for light and dark, and font faces', () => {
    const code = `@font-face { font-family: Inter; src: url(/fonts/inter.woff2) format("woff2"); }
:root {
  --primary: #0d9488;
  --radius: 10px;
  --font: Inter, ui-sans-serif, sans-serif;
}
[data-theme="dark"] { --primary: #2dd4bf; }
`
    expect(compileTheme(code, 'protobase.theme.css', known)).toEqual({
      css: '@font-face{font-family:Inter;src:url(/fonts/inter.woff2)format("woff2")}:root{--primary:#0d9488;--radius:10px;--font:Inter, ui-sans-serif, sans-serif}[data-theme=dark]{--primary:#2dd4bf}',
      warnings: [],
    })
  })

  it('warns about a token the app does not read, a likely typo', () => {
    expect(compileTheme(':root { --primry: red; }', 'protobase.theme.css', known).warnings).toEqual(['protobase.theme.css:1: --primry is not a token the app reads; check its name'])
  })

  it('refuses anything but token values, naming where', () => {
    const code = `:root { --primary: red; color: blue; }
.sidebar { --primary: red; }
@media (min-width: 40rem) { :root { --radius: 4px; } }
:root { --font: serif; & .x { --radius: 0; } }
`
    expect(() => compileTheme(code, 'protobase.theme.css', known)).toThrow(
      [
        'protobase.theme.css is not a theme:',
        '  - protobase.theme.css:1: color is no token; a theme sets only tokens such as --primary',
        '  - protobase.theme.css:2: a theme sets tokens on :root and [data-theme="dark"] only, not on other selectors',
        '  - protobase.theme.css:3: @media is not allowed; a theme holds token values under :root and [data-theme="dark"], and @font-face',
        '  - protobase.theme.css:4: a theme holds no nested rules',
      ].join('\n'),
    )
  })
})
