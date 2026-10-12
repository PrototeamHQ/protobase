import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { transform, type Rule } from 'lightningcss'
import { uiEntry } from '../project/admin-app'

/** The project's theme, at its root, and where a bundle's `public` folder has it: the app links it at `/protobase.theme.css`. */
export const themeFile = 'protobase.theme.css'

// The app's tokens, the CSS variables its components read, beside its stylesheet in @protobase/ui's src and dist alike.
const tokensFile = path.join(path.dirname(uiEntry), 'tokens.css')

/** The names of the tokens the installed @protobase/ui reads, such as `--primary` and `--radius`. */
export const themeTokens = async (file = tokensFile) => new Set([...(await readFile(file, 'utf8')).matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name!))

// A selector of the theme: the light values on :root, the dark ones on [data-theme="dark"].
const isThemeSelector = (selector: unknown[]) => {
  if (selector.length !== 1) return false
  const [part] = selector as Array<{ type: string; kind?: string; name?: string; operation?: { value: string } }>
  return (part!.type === 'pseudo-class' && part!.kind === 'root') || (part!.type === 'attribute' && part!.name === 'data-theme' && part!.operation?.value === 'dark')
}

const where = (file: string, line: number) => `${file}:${line + 1}`

// What is wrong with one top-level rule of a theme, and the tokens it sets.
const checkRule = (rule: Rule, file: string): { problems: string[]; tokens: Array<{ name: string; line: number }> } => {
  if (rule.type === 'font-face') return { problems: [], tokens: [] }
  if (rule.type !== 'style') {
    const line = ('value' in rule ? (rule.value as { loc?: { line: number } }).loc?.line : undefined) ?? 0
    return { problems: [`${where(file, line)}: @${rule.type} is not allowed; a theme holds token values under :root and [data-theme="dark"], and @font-face`], tokens: [] }
  }
  const { selectors, declarations, rules, loc } = rule.value
  const problems: string[] = []
  if (!selectors.every(isThemeSelector)) problems.push(`${where(file, loc.line)}: a theme sets tokens on :root and [data-theme="dark"] only, not on other selectors`)
  if ((rules ?? []).length > 0) problems.push(`${where(file, loc.line)}: a theme holds no nested rules`)
  const all = [...(declarations?.declarations ?? []), ...(declarations?.importantDeclarations ?? [])]
  const properties = all.filter((declaration) => declaration.property !== 'custom').map((declaration) => declaration.property)
  if (properties.length > 0) problems.push(`${where(file, loc.line)}: ${properties.join(', ')} ${properties.length === 1 ? 'is no token' : 'are no tokens'}; a theme sets only tokens such as --primary`)
  const tokens = all.flatMap((declaration) => (declaration.property === 'custom' ? [{ name: declaration.value.name, line: loc.line }] : []))
  return { problems, tokens }
}

/**
 * The theme in `code` minified, once it holds only token values, under :root (light, and dark unless dark sets its
 * own) and [data-theme="dark"], and @font-face rules: no selector into the app, so it works on every version of it.
 * Throws naming each place that holds something else; a token the app does not read is a warning, a likely typo.
 */
export const compileTheme = (code: string, file: string, known: ReadonlySet<string>): { css: string; warnings: string[] } => {
  const problems: string[] = []
  const warnings: string[] = []
  const css = transform({
    filename: file,
    code: Buffer.from(code),
    minify: true,
    visitor: {
      StyleSheet(sheet) {
        for (const rule of sheet.rules) {
          const checked = checkRule(rule, file)
          problems.push(...checked.problems)
          for (const token of checked.tokens) if (!known.has(token.name)) warnings.push(`${where(file, token.line)}: ${token.name} is not a token the app reads; check its name`)
        }
        return sheet
      },
    },
  }).code.toString()
  if (problems.length > 0) throw new Error(`${file} is not a theme:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
  return { css, warnings }
}

/**
 * Writes the project's protobase.theme.css, checked and minified, to `outFile`, and an empty file when it has none, so
 * the stylesheet the app links is always there. Returns the warnings about it.
 */
export const buildTheme = async ({ projectDir, outFile }: { projectDir: string; outFile: string }): Promise<string[]> => {
  const source = path.join(projectDir, themeFile)
  if (!existsSync(source)) {
    await writeFile(outFile, '')
    return []
  }
  const { css, warnings } = compileTheme(await readFile(source, 'utf8'), themeFile, await themeTokens())
  await writeFile(outFile, css)
  return warnings
}
