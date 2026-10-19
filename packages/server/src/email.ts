// `@protobase/server/email`: the look of Protobase's own mail for an app's emails, apart from the main entry so the
// server and the serve runtime load React Email's components only when an email needs them.
export { EmailButton, EmailCode, EmailLayout, EmailNote, type EmailLayoutProps } from './mail/email-layout'
export type { MailingApp } from './mail/mailing-app'
