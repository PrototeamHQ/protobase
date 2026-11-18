import { builtInModules, type ModuleId } from './modules'

/** Refuses a set of modules with one on while a module it requires is off, naming both. */
export const checkRequiredModules = (on: readonly ModuleId[]) => {
  for (const module of builtInModules.filter(({ id }) => on.includes(id))) {
    const off = module.requires.find((required) => !on.includes(required))
    if (off !== undefined) throw new Error(`The ${module.id} module is on while ${off}, which it requires, is off: turn ${off} on, or ${module.id} off`)
  }
}

/** Every module: each store has every module's tables, whether the app uses the feature or not. */
export const allModules: ModuleId[] = builtInModules.map(({ id }) => id)
