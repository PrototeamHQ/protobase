import { anonymousRole, type RoleLimit, type ViewModel } from '@protobase/schema'
import type { Registry } from '../registry'
import { createFormChallenges, type Difficulty } from './challenge'
import { checkForms } from './check-forms'
import { createRateLimit } from './rate-limit'

export type FormsRuntimeInput = {
  registry: Registry
  views: readonly ViewModel[]
  /** The roles' limits, where the anonymous role's `create` lists the fields it may set. */
  limits: readonly RoleLimit[]
  env: Record<string, string | undefined>
  /** The proof-of-work range; tests make it tiny. */
  difficulty?: Difficulty
}

/** The fields the anonymous role may create on `resource`, or `undefined` when it may not create there. */
const anonymousCreates = (limits: readonly RoleLimit[]) => (resource: string) => {
  const held = limits.filter((limit) => limit.role === anonymousRole && limit.capability === `${resource}.create`)
  return held.length === 0 ? undefined : held.flatMap((limit) => limit.fields ?? [])
}

/**
 * The public forms of the views, checked, with the challenges that guard them and their rate limit; `undefined` without
 * any. Fails at startup on a form that cannot be served and when nothing signs the challenges.
 */
export const createFormsRuntime = ({ registry, views, limits, env, difficulty }: FormsRuntimeInput) => {
  // The view without roles first, so a form it shares with a view built on it takes its field hints
  const ordered = [...views].sort((a, b) => Number(a.roles !== undefined) - Number(b.roles !== undefined))
  const declared = ordered.flatMap((view) => (view.forms ?? []).map((form) => ({ form, view })))
  if (declared.length === 0) return undefined
  const forms = checkForms(registry, declared, anonymousCreates(limits))
  const secret = env.PROTOBASE_FORMS_SECRET ?? env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('Public forms need a secret to sign their bot checks: set PROTOBASE_FORMS_SECRET or BETTER_AUTH_SECRET')
  return { forms, challenges: createFormChallenges(secret, { ...(difficulty && { difficulty }) }), limit: createRateLimit() }
}

export type FormsRuntime = NonNullable<ReturnType<typeof createFormsRuntime>>
