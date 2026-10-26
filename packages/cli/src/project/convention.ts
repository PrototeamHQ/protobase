// The config module by convention: config/index.ts, plus every config/<dir>/ui.ts export the index does not
// already export, named `<dir>:<export>`. Imports nothing, so `protobase build` can inline it into a bundle.
// `order` names the index's exports in the order its source declares them, which a bundle's namespace has lost.
export const conventionConfig = (index: Record<string, unknown>, uiModules: Array<[dir: string, exports: Record<string, unknown>]>, order: string[] = []) => {
  const config: Record<string, unknown> = Object.fromEntries(order.filter((name) => Object.hasOwn(index, name)).map((name) => [name, index[name]]))
  Object.assign(config, index)
  for (const [dir, exports] of uiModules) {
    for (const [key, value] of Object.entries(exports)) {
      if (!Object.values(config).includes(value)) config[`${dir}:${key}`] = value
    }
  }
  return config
}
