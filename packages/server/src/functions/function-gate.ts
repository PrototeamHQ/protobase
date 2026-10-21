import type { ResolveOptions } from '@protobase/schema'
import { parseCapability } from '@protobase/schema/internal'
import { forbidden } from '../problem'
import type { Session } from '../types'
import type { FunctionOptions } from './define-function'

/** Whether a caller may call a function; a public one asks nobody. */
export type FunctionGate = (session: Session) => boolean

const open: FunctionGate = () => true

const holdsOf = (name: string, access: ResolveOptions) => {
  const holds = access.roles?.holds
  if (!holds) throw new Error(`The function "${name}" is gated by the app's roles, but they have no holds(user, capability): define them with defineRoles`)
  return holds
}

/**
 * Who may call a function, checked at startup: anyone, for a public one; one of its `roles`, or a caller holding all of its
 * `capability`. Without either, an app with roles lets in only callers holding `*`, unless `defaultAccess` is `allow`;
 * an app without roles lets in every signed-in caller.
 */
export const functionGate = (name: string, options: FunctionOptions, access: ResolveOptions): FunctionGate => {
  if (options.public) return open
  const { roles, capability } = options
  if (roles && capability) throw new Error(`The function "${name}" has both roles and a capability: give one`)
  if (roles) return (session) => roles.some((role) => session.user.roles.includes(role))
  if (capability) {
    if (!access.roles) throw new Error(`The function "${name}" needs the capability "${capability}", but the app defines no roles`)
    parseCapability(capability)
    const holds = holdsOf(name, access)
    return (session) => holds(session.user, capability)
  }
  if (!access.roles || access.defaultAccess === 'allow') return open
  const holds = holdsOf(name, access)
  return (session) => holds(session.user, '*')
}

/** Throws the 403 problem for a caller the gate refuses. */
export const requireGate = (name: string, gate: FunctionGate, session: Session) => {
  if (gate(session)) return
  throw forbidden('function-forbidden', `You may not call the function "${name}"`)
}
