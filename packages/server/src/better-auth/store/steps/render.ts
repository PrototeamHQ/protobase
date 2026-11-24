import type { RawBuilder } from 'kysely'
import { builtInModules, type ModuleId } from '../../names/modules'
import { moduleSteps } from '.'
import type { MigrationNames, OrganizationsInput, Step, StepInput } from './step'

/**
 * A step to apply: its own statements, its check first; or, with `on`, the statements it adds to that module's tables.
 * `version` is the version of the former single chain whose tables and columns they make (`legacy-versions.ts`);
 * `check`, the check `statements` start with; `after`, what runs once the migration's transaction commits (`Step`).
 */
export type RenderedStep = {
  module: ModuleId
  step: Step
  on?: ModuleId
  version: number
  check?: RawBuilder<unknown>
  statements: RawBuilder<unknown>[]
  after: (concurrent: boolean) => RawBuilder<unknown>[]
}

/** Whether the store applied the part of `step` of `module` that changes the tables of `target`. */
export type Had = (module: ModuleId, step: number, target: ModuleId) => boolean

/**
 * The version of the former single chain that made the part of `step` changing the tables of `target`: the step's
 * own, or for the statements it adds to another module's tables, the later of its and that of the step that made
 * them, as the former chain, with every module on, made them.
 */
export const partVersion = (module: ModuleId, step: Step, target: ModuleId) => (target === module ? step.version : Math.max(step.version, moduleSteps[target][0]!.version))

const addsOn = (names: MigrationNames, input: StepInput, module: ModuleId, step: Step, on: ModuleId): RenderedStep => {
  const check = step.addsChecks?.[on]?.(names, input)
  const after = step.addsAfter?.[on]
  return {
    module,
    step,
    on,
    version: partVersion(module, step, on),
    ...(check && { check }),
    statements: [...(check ? [check] : []), ...step.adds![on]!(names, input)],
    after: (concurrent) => after?.(names, input, concurrent) ?? [],
  }
}

const ownPart = (names: MigrationNames, input: StepInput, module: ModuleId, step: Step): RenderedStep => {
  const check = step.check?.(names, input)
  return { module, step, version: step.version, ...(check && { check }), statements: [...(check ? [check] : []), ...step.statements(names, input)], after: () => [] }
}

/**
 * The parts of the modules that are on that the store lacks, in order: each module's steps in its chain's order, the
 * modules in the order they require one another, and the statements a step adds to another module's tables once that
 * module's are there. A module the store has none of, such as one just turned on, gets its whole chain, and the
 * statements other modules' steps add to its tables, those the store has applied included; a module that is off gets
 * nothing, and no other module adds to its tables. `organizations`: the config's default organization and the role of
 * the users there already, which the organizations' steps write rows from; organizations turn on for the first time
 * when the store lacks their first step, and the users are there when it has sign-in's or another system made them.
 */
export const renderSteps = (names: MigrationNames, modules: readonly ModuleId[], had: Had, organizations: OrganizationsInput | undefined): RenderedStep[] => {
  const input: StepInput = { organizations, firstOn: !had('organizations', 1, 'organizations'), usersThere: names.externalUser || had('auth', 1, 'auth') }
  const on = builtInModules.map(({ id }) => id).filter((module) => modules.includes(module))
  const rendered: RenderedStep[] = []
  // The statements steps add to a module whose tables come later in this order.
  const waiting: RenderedStep[] = []
  const made = new Set(on.filter((module) => had(module, moduleSteps[module][0]!.step, module)))
  for (const module of on) {
    for (const step of moduleSteps[module]) {
      if (!had(module, step.step, module)) rendered.push(ownPart(names, input, module, step))
      for (const target of on.filter((target) => step.adds?.[target] && !had(module, step.step, target))) (made.has(target) ? rendered : waiting).push(addsOn(names, input, module, step, target))
    }
    made.add(module)
    rendered.push(...waiting.filter((adds) => adds.on === module))
  }
  return rendered
}
