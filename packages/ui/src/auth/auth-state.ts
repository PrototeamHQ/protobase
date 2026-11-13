import type { AuthUser, StaffSignIn, TwoFactorMethod, RequiredSetup } from '@protobase/client'

export type AuthState =
  | { kind: 'loading' }
  /** `firstAdminUrl`: the platform's page where the first user is added, when it names one. */
  | { kind: 'needs-admin'; firstAdminUrl?: string }
  | { kind: 'signed-out' }
  /** Not signed in, browsing what the project's anonymous role reads; the sign-in route signs them in. */
  | { kind: 'visitor' }
  /** The password or emailed code was right; the account's second step is next. */
  | { kind: 'two-factor'; methods: TwoFactorMethod[] }
  /** Signed in, but the sign-in policy requires something the account has not set up; no API token until it has. */
  | { kind: 'setup-required'; user: AuthUser; missing: RequiredSetup[] }
  /** `staff`: staff of the operator signed in as `user`, for support; the app shows a banner to stop it. */
  | { kind: 'signed-in'; user: AuthUser; staff?: StaffSignIn }
  | { kind: 'error'; message: string }
