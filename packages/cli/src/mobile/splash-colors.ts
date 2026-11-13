import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { transform, type CssColor, type Declaration, type RGBColor, type Rule, type TokenOrValue } from 'lightningcss'
import { themeFile, themeScheme, tokensFile } from '../build/theme'

/** The native splash screen's background in light and dark mode, each a `#rrggbb` colour. */
export type SplashColors = { light: string; dark: string }

type Backgrounds = { light?: TokenOrValue[]; dark?: TokenOrValue[] }

// Records each `--background` of `declarations` in `found`, by the scheme of the rule's selectors; a later one wins.
const record = (found: Backgrounds, selectors: unknown[][], declarations: Declaration[]) => {
  for (const declaration of declarations) {
    if (declaration.property !== 'custom' || declaration.value.name !== '--background') continue
    for (const selector of selectors) {
      const scheme = themeScheme(selector)
      if (scheme) found[scheme] = declaration.value.value
    }
  }
}

// The `--background` values a stylesheet sets on :root and [data-theme="dark"], also inside `@layer`: the last one
// wins, and an `!important` one wins over every other.
const backgrounds = (code: string, file: string): Backgrounds => {
  const normal: Backgrounds = {}
  const important: Backgrounds = {}
  const visit = (rules: Rule[]) => {
    for (const rule of rules) {
      if (rule.type === 'layer-block') visit(rule.value.rules)
      if (rule.type !== 'style') continue
      record(normal, rule.value.selectors, rule.value.declarations?.declarations ?? [])
      record(important, rule.value.selectors, rule.value.declarations?.importantDeclarations ?? [])
    }
  }
  transform({ filename: file, code: Buffer.from(code), visitor: { StyleSheet: (sheet) => void visit(sheet.rules) } })
  return { light: important.light ?? normal.light, dark: important.dark ?? normal.dark }
}

/** A CSS colour, such as `white` or `#0d9488`, as the property `color` reads it; `undefined` when it is none. */
export const cssColor = (text: string) => {
  let color: CssColor | undefined
  transform({ filename: 'name.css', code: Buffer.from(`a{color:${text}}`), visitor: { Declaration: { color: (declaration) => void (declaration.property === 'color' && (color = declaration.value)) } } })
  return color
}

// The colour a custom property's value is, when it is one colour.
const parsedColor = (value: TokenOrValue[]) => {
  const [only] = value
  if (value.length !== 1 || !only) return
  if (only.type === 'color') return only.value
  if (only.type === 'token' && only.value.type === 'ident') return cssColor(only.value.value)
  return
}

const isRgb = (color: CssColor | undefined): color is RGBColor => typeof color === 'object' && color.type === 'rgb'

const hex = (value: number) => value.toString(16).padStart(2, '0')

/** The colour as `#rrggbb`, the way native colours take it; `undefined` for one that is not an opaque sRGB colour. */
export const opaqueHex = (color: CssColor | undefined) => {
  if (!isRgb(color) || color.alpha !== 1) return
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`
}

// The value as `#rrggbb`: native colours take an opaque sRGB colour, such as `#f4f3ee`, `rgb()`, `hsl()` or `white`.
const nativeColor = (value: TokenOrValue[], where: string) => {
  const color = opaqueHex(parsedColor(value))
  if (!color) throw new Error(`${where}: the native splash screen needs --background as an opaque sRGB colour, such as #f4f3ee, rgb() or hsl()`)
  return color
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
