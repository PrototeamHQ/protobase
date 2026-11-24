import type { RawBuilder } from 'kysely'
import { builtInModules, type ModuleId } from '../../names/modules'
import type { Had } from '../step-record'
import { moduleSteps } from '.'
import type { MigrationNames, Step } from './step'

/**
 * A step to apply: its own statements, its check first; or, with `on`, the statements it adds to that module's tables.
 * `version` is the version of the former single chain whose tables and columns they make (`legacy-versions.ts`).
 */
export type RenderedStep = { module: ModuleId; step: Step; on?: ModuleId; version: number; statements: RawBuilder<unknown>[] }

/**
 * The version of the former single chain that made the part of `step` changing the tables of `target`: the step's
 * own, or for the statements it adds to another module's tables, the later of its and that of the step that made
 * them, as the former chain, with every module on, made them.
 */
export const partVersion = (module: ModuleId, step: Step, target: ModuleId) => (target === module ? step.version : Math.max(step.version, moduleSteps[target][0]!.version))

const addsOn = (names: MigrationNames, module: ModuleId, step: Step, on: ModuleId): RenderedStep => ({
  module,
  step,
  on,
  version: partVersion(module, step, on),
  statements: step.adds![on]!(names),
})

/**
 * The parts of the modules that are on that the store lacks, in order: each module's steps in its chain's order, the
 * modules in the order they require one another, and the statements a step adds to another module's tables once that
 * module's are there. A module the store has none of, such as one just turned on, gets its whole chain, and the
 * statements other modules' steps add to its tables, those the store has applied included; a module that is off gets
 * nothing, and no other module adds to its tables.
 */
export const renderSteps = (names: MigrationNames, modules: readonly ModuleId[], had: Had): RenderedStep[] => {
  const on = builtInModules.map(({ id }) => id).filter((module) => modules.includes(module))
  const rendered: RenderedStep[] = []
  // The statements steps add to a module whose tables come later in this order.
  const waiting: RenderedStep[] = []
  const made = new Set(on.filter((module) => had(module, moduleSteps[module][0]!.step, module)))
  for (const module of on) {
    for (const step of moduleSteps[module]) {
      if (!had(module, step.step, module)) rendered.push({ module, step, version: step.version, statements: [...(step.check ? [step.check(names)] : []), ...step.statements(names)] })
      for (const target of on.filter((target) => step.adds?.[target] && !had(module, step.step, target))) (made.has(target) ? rendered : waiting).push(addsOn(names, module, step, target))
    }
    made.add(module)
    rendered.push(...waiting.filter((adds) => adds.on === module))
  }
  return rendered
}
