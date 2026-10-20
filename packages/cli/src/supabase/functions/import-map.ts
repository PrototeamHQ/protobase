import { ts } from 'ts-morph'

/** A Deno import map's `imports`: a bare name, or a prefix ending in `/`, to the specifier it stands for. */
export type ImportMap = Record<string, string>

/** The `imports` of a `deno.json`, `deno.jsonc` or `import_map.json`, comments allowed; a file that does not parse is an error naming it. */
export const readImportMap = (file: string, text: string): ImportMap => {
  const { config, error } = ts.parseConfigFileTextToJson(file, text)
  if (error) throw new Error(`${file} is not JSON: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`)
  const imports: unknown = config?.imports
  if (imports === undefined) return {}
  if (typeof imports !== 'object' || imports === null) throw new Error(`${file}: "imports" is not an object`)
  return Object.fromEntries(Object.entries(imports).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

/** What `specifier` stands for under `map`: its exact entry, or the longest prefix entry, as Deno resolves it. */
export const resolveImport = (specifier: string, map: ImportMap) => {
  if (map[specifier] !== undefined) return map[specifier]
  const prefix = Object.keys(map).filter((key) => key.endsWith('/') && specifier.startsWith(key)).sort((a, b) => b.length - a.length)[0]
  return prefix === undefined ? specifier : map[prefix] + specifier.slice(prefix.length)
}
