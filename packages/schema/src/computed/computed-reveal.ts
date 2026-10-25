import type { AccessUser, FieldRule } from '../access/types'

/** Who asks for a computed reveal: the user, and with organizations the one the request works in. */
export type RevealCaller = {
  /** The user, with the roles they act with. */
  user: AccessUser
  /** With organizations, the one the request works in. */
  organization?: {
    /** The organization's id. */
    id: string | number
  }
}

/**
 * A value revealed like a sensitive field, but made when it is asked for instead of read from a column, such as a
 * secret another service keeps (`.reveals()`).
 */
export type ComputedReveal<R> = {
  /** The value, from the record as the caller may read it, without its sensitive fields; `null` reveals nothing. */
  value: (record: R, caller: RevealCaller) => unknown
  /** Who may reveal it, among those who may read the record: a role rule, as a field's read rule is. Default: all of them. */
  read?: FieldRule
  /** Revealing it needs a strong sign-in this recent, as the field option `.strongSignIn()` does; `minutes` is 15 by default. */
  strongSignIn?: {
    /** The most minutes since the sign-in, or its confirmation, proved a passkey or a second step. */
    minutes?: number
  }
}
