/**
 * What a plugin uses from Protobase, as `protobase build-plugin` records it in plugin.json, or what an app provides:
 * the names imported from each module the app shares with plugins (`*` for the whole module, as `import * as` takes
 * it), and the extension points filled, such as `components` or `shell.rightPanel`.
 */
export type PluginCapabilities = { imports: Record<string, readonly string[]>; extensionPoints: readonly string[] }

/**
 * What `uses` names that `has` lacks, each as the notice shows it: `Name from module`, a whole `module`, or `the
 * extension point name`. Empty when the app provides all of it, whatever versions it has.
 */
export const missingCapabilities = (uses: PluginCapabilities, has: PluginCapabilities): string[] => {
  const imports = Object.entries(uses.imports).flatMap(([module, names]) => {
    const provided = has.imports[module]
    if (provided === undefined) return [module]
    return names.filter((name) => name !== '*' && !provided.includes(name)).map((name) => `${name} from ${module}`)
  })
  const extensionPoints = uses.extensionPoints.filter((point) => !has.extensionPoints.includes(point)).map((point) => `the extension point ${point}`)
  return [...imports, ...extensionPoints]
}
