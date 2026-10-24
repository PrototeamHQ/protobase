// Every auth email Protobase sends. Only `sendAuthEmail` loads this module, and only when it sends one.
export { accountExistsEmail } from './account-exists-email'
export { invitationEmail } from './invitation-email'
export { noAccountEmail } from './no-account-email'
export { resetPasswordEmail } from './reset-password-email'
export { signInCodeEmail } from './sign-in-code-email'
export { signUpCodeEmail } from './sign-up-code-email'
export { staffSignInEmail } from './staff-sign-in-email'
export { twoFactorCodeEmail } from './two-factor-code-email'
