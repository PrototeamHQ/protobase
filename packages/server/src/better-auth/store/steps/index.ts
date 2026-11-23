import type { ModuleId } from '../../names/modules'
import { core } from './auth/001-core'
import { accountKeys } from './auth/002-account-keys'
import { userIndexes } from './auth/003-user-indexes'
import { verificationPatternIndex } from './auth/004-verification-pattern-index'
import { userNameSearch } from './auth/005-user-name-search'
import { mailSenders } from './mail-senders/001-mail-senders'
import { mailSenderNames } from './mail-senders/002-mail-sender-names'
import { senderAddressEvidence } from './mail-senders/003-sender-address-evidence'
import { senderVerifications } from './mail-senders/004-sender-verifications'
import { mcp } from './mcp/001-mcp'
import { organizations } from './organizations/001-organizations'
import { organizationIndex } from './organizations/002-organization-index'
import { passkeys } from './passkeys/001-passkeys'
import { rpIdIndex } from './passkeys/002-rp-id-index'
import { personalAccessTokens } from './personal-access-tokens/001-personal-access-tokens'
import { platformDevices } from './platform-devices/001-platform-devices'
import { signInPolicy } from './sign-in-policy/001-sign-in-policy'
import { staffSignIn } from './staff-sign-in/001-staff-sign-in'
import { staffSignInIndexes } from './staff-sign-in/002-staff-sign-in-indexes'
import { twoFactor } from './two-factor/001-two-factor'
import type { Step } from './step'

/** Each module's chain of steps, the only source of its tables: a new step goes last in its module's chain, with the next number. */
export const moduleSteps: Record<ModuleId, Step[]> = {
  auth: [core, accountKeys, userIndexes, verificationPatternIndex, userNameSearch],
  two_factor: [twoFactor],
  passkeys: [passkeys, rpIdIndex],
  sign_in_policy: [signInPolicy],
  staff_sign_in: [staffSignIn, staffSignInIndexes],
  organizations: [organizations, organizationIndex],
  mcp: [mcp],
  personal_access_tokens: [personalAccessTokens],
  mail_senders: [mailSenders, mailSenderNames, senderAddressEvidence, senderVerifications],
  platform_devices: [platformDevices],
}
