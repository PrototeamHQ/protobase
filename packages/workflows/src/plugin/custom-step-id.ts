/** The plugin name the app's custom steps take, as `custom:<name>:<version>`; no plugin may take it. */
export const customPlugin = 'custom'

const customId = /^custom:([a-z][a-z0-9_]*):([1-9][0-9]*)$/

/** The custom step and version a step type's id names, `custom:<name>:<version>`; undefined for any other id. */
export const customStepOf = (id: string): { name: string; version: number } | undefined => {
  const found = customId.exec(id)
  return found ? { name: found[1]!, version: Number(found[2]) } : undefined
}
