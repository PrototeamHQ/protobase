import type { Authenticator } from '../types'

/** An authenticator of the app's own over the one its sign-in makes, as `auth/authenticate.ts` exports it (`overSignIn`). */
export type OverSignIn = {
  /** Makes the app's authenticator from the one the app's sign-in and its `authenticate` settings make. */
  overSignIn: (signIn: Authenticator) => Authenticator
}

/**
 * An authenticator of the app's own made over the one its sign-in makes, as the default export of `auth/authenticate.ts`:
 * `export default overSignIn((signIn) => withUsers(signIn))`, such as one that maps the signed-in account to a user of
 * the app's own table and declares those ids' type (`userIdType`), which the owner fields are then checked against, by
 * `protobase doctor` too.
 */
export const overSignIn = (make: (signIn: Authenticator) => Authenticator): OverSignIn => ({ overSignIn: make })

/** Whether `auth/authenticate.ts`'s default export is made over the app's sign-in (`overSignIn`). */
export const isOverSignIn = (value: unknown): value is OverSignIn =>
  typeof value === 'object' && value !== null && typeof (value as Partial<OverSignIn>).overSignIn === 'function'
