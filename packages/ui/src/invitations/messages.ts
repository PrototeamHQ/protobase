import { defineMessages } from '../locale/messages'

export const text = defineMessages({
  en: {
    email: 'Email',
    invite: 'Invite',
    expired: 'Expired',
    until: (date: string) => `Until ${date}`,
    sendAgain: 'Send again',
    revoke: 'Revoke',
    passLinkOn: 'This app cannot send email, so pass this link on yourself. It works once, until the invitation expires: {}',
  },
  nl: {
    email: 'E-mailadres',
    invite: 'Uitnodigen',
    expired: 'Verlopen',
    until: (date: string) => `Tot ${date}`,
    sendAgain: 'Opnieuw sturen',
    revoke: 'Intrekken',
    passLinkOn: 'Deze app kan geen e-mail sturen, dus geef deze link zelf door. Die werkt één keer, tot de uitnodiging verloopt: {}',
  },
})
