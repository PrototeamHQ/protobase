import { allModules } from '../names/modules-on'
import type { StoreNames } from './store-names'

// The record of the store's migrations holds versions of its former single chain, and the steps of one version may
// belong to several modules: a version recorded while one of its modules is off would read as that module's step too.

/** Refuses to write the store's migrations, an adoption included, while a module is off. */
export const refuseModulesOff = (names: StoreNames) => {
  const off = allModules.filter((module) => !names.names.modules.includes(module))
  if (off.length > 0) throw new Error(`The auth store's migrations are written with every module on, and ${off.join(', ')} is off`)
}
