import { signUpCodeLifetime } from './sign-up-code'

/** The email with the code that makes an account for the address. */
export const signUpCodeEmail = ({ to, code, appName }: { to: string; code: string; appName: string }) => ({
  to,
  subject: 'Your code to create an account',
  text: [`Use this code to create your account for ${appName}:`, '', code, '', `It works for ${signUpCodeLifetime}, once.`, 'If you did not try to create an account, ignore this email: nobody can create one for your address without the code.', ''].join('\n'),
})

/** The email to an address that asked for a sign-up code while it has an account already: no code, a pointer to sign in instead. */
export const accountExistsEmail = ({ to, appName }: { to: string; appName: string }) => ({
  to,
  subject: 'You already have an account',
  text: [`Someone asked to create an account for ${appName} with this address, which has one already, so no new account was made.`, '', 'Sign in with it instead. If this was not you, ignore this email.', ''].join('\n'),
})
