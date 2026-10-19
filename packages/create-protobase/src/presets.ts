import { readdirSync } from 'node:fs'

/** The preset a new project starts from when nobody picks one. */
export const defaultPreset = 'scratch'

/** The presets the build wrote to `templatesDir`, one folder each, the default first and the others by name. */
export const presetNames = (templatesDir: string) => {
  const names = readdirSync(templatesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  if (!names.includes(defaultPreset)) throw new Error(`no ${defaultPreset} preset in ${templatesDir}`)
  return [defaultPreset, ...names.filter((name) => name !== defaultPreset)]
}

/** `name` when it is one of `names`, else an error that lists them. */
export const checkPreset = (names: string[], name: string) => {
  if (!names.includes(name)) throw new Error(`unknown preset ${name}: pick one of ${names.join(', ')}`)
  return name
}
