import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { transform, type CssColor, type RGBColor, type Rule, type TokenOrValue } from 'lightningcss'
import { themeFile, themeScheme, tokensFile } from '../build/theme'

/** The native splash screen's background in light and dark mode, each a `#rrggbb` colour. */
export type SplashColors = { light: string; dark: string }

type Backgrounds = { light?: TokenOrValue[]; dark?: TokenOrValue[] }

// The `--background` values a stylesheet sets on :root and [data-theme="dark"], also inside `@layer`; the last one wins.
const backgrounds = (code: string, file: string) => {
  const found: Backgrounds = {}
  const visit = (rules: Rule[]) => {
    for (const rule of rules) {
      if (rule.type === 'layer-block') visit(rule.value.rules)
      if (rule.type !== 'style') continue
      for (const declaration of rule.value.declarations?.declarations ?? []) {
        if (declaration.property !== 'custom' || declaration.value.name !== '--background') continue
        for (const selector of rule.value.selectors) {
          const scheme = themeScheme(selector)
          if (scheme) found[scheme] = declaration.value.value
        }
      }
    }
  }
  transform({ filename: file, code: Buffer.from(code), visitor: { StyleSheet: (sheet) => void visit(sheet.rules) } })
  return found
}

// A colour name such as `white`, which a custom property keeps as a word, as the colour `color` reads it.
const namedColor = (name: string) => {
  let color: CssColor | undefined
  transform({ filename: 'name.css', code: Buffer.from(`a{color:${name}}`), visitor: { Declaration: { color: (declaration) => void (declaration.property === 'color' && (color = declaration.value)) } } })
  return color
}

// The colour a custom property's value is, when it is one colour.
const parsedColor = (value: TokenOrValue[]) => {
  const [only] = value
  if (value.length !== 1 || !only) return
  if (only.type === 'color') return only.value
  if (only.type === 'token' && only.value.type === 'ident') return namedColor(only.value.value)
  return
}

const isRgb = (color: CssColor | undefined): color is RGBColor => typeof color === 'object' && color.type === 'rgb'

const hex = (value: number) => value.toString(16).padStart(2, '0')

// The value as `#rrggbb`: native colours take an opaque sRGB colour, such as `#f4f3ee`, `rgb()`, `hsl()` or `white`.
const nativeColor = (value: TokenOrValue[], where: string) => {
  const color = parsedColor(value)
  if (!isRgb(color) || color.alpha !== 1) throw new Error(`${where}: the native splash screen needs --background as an opaque sRGB colour, such as #f4f3ee, rgb() or hsl()`)
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`
}

/**
 * The background the app's first screen paints, for the native splash screen: `--background` from the project's
 * protobase.theme.css, where it sets it, and from the installed @protobase/ui's tokens otherwise. As in the app, a theme
 * that sets it on :root only sets it for dark mode too.
 */
export const splashColors = async (projectDir: string, tokens = tokensFile): Promise<SplashColors> => {
  const source = path.join(projectDir, themeFile)
  const theme = existsSync(source) ? backgrounds(await readFile(source, 'utf8'), themeFile) : {}
  const ui = backgrounds(await readFile(tokens, 'utf8'), tokens)
  // The first value set, in order of precedence.
  const pick = (scheme: 'light' | 'dark', ...choices: Array<[TokenOrValue[] | undefined, string]>) => {
    for (const [value, where] of choices) if (value) return nativeColor(value, where)
    throw new Error(`${tokens} sets no ${scheme} --background`)
  }
  return {
    light: pick('light', [theme.light, themeFile], [ui.light, tokens]),
    dark: pick('dark', [theme.dark, themeFile], [theme.light, themeFile], [ui.dark, tokens]),
  }
}
