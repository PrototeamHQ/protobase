import { allModules } from '../names/modules-on'
import type { Had } from './steps/render'
import type { StoreNames } from './store-names'

// The record of the store's migrations holds versions of its former single chain, and the steps of one version may
// belong to several modules: a version recorded while one of its modules is off would read as that module's step too.
// The guard and `hadByVersion` go together, and only a record of which module's step ran lifts them.

/** Refuses to write the store's migrations, an adoption included, while a module is off. */
export const refuseModulesOff = (names: StoreNames) => {
  const off = allModules.filter((module) => !names.names.modules.includes(module))
  if (off.length > 0) throw new Error(`The auth store's migrations are written with every module on, and ${off.join(', ')} is off`)
}

/**
 * Whether the store has a step, from the versions it recorded: a version stands for every step naming it, whatever its
 * module. Sound because every version was recorded with every module on, by the former chain, which made every
 * module's tables, or since then behind `refuseModulesOff`; adoption records a version only once the store has every
 * column its steps make. A released step keeps its version and a new one takes a version no other step has
 * (`shipped-steps.test.ts`).
 */
export const hadByVersion =
  (applied: readonly number[]): Had =>
  (_module, step) =>
    applied.includes(step.version)
