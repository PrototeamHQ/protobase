// The config module by convention: config/index.ts, plus every config/<dir>/ui.ts export the index does not
// already export, named `<dir>:<export>`. Imports nothing, so `protobase build` can inline it into a bundle.
export const conventionConfig = (index: Record<string, unknown>, uiModules: Array<[dir: string, exports: Record<string, unknown>]>) => {
  const config: Record<string, unknown> = { ...index }
  for (const [dir, exports] of uiModules) {
    for (const [key, value] of Object.entries(exports)) {
      if (!Object.values(config).includes(value)) config[`${dir}:${key}`] = value
    }
  }
  return config
}
