import { core } from './001-core'
import { twoFactor } from './002-two-factor'
import { passkeys } from './003-passkeys'
import { signInPolicy } from './004-sign-in-policy'
import { staffSignIn } from './005-staff-sign-in'
import { organizations } from './006-organizations'
import { mcp } from './007-mcp'
import type { StoreMigration } from './migration'

// Every table of every feature, whether the app turns the feature on or not, so turning one on or off never changes
// the schema and no relationship has to depend on it. SAML providers and open sign-up keep nothing of their own.

/** The auth store's migrations, by version. A new one goes last, with the next version. */
export const storeMigrations: StoreMigration[] = [core, twoFactor, passkeys, signInPolicy, staffSignIn, organizations, mcp]

/** The version the store is at once every migration is applied. */
export const latestStoreVersion = storeMigrations.at(-1)!.version
