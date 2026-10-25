import { defineMessages } from '../locale/messages'

export const text = defineMessages({
  en: {
    confirmTitle: "Confirm it's you",
    confirmWhy: (minutes: number) => `Showing this needs a passkey or your authenticator app in the last ${minutes} minutes.`,
    usePasskey: 'Use a passkey',
    authenticatorCode: 'Code from your authenticator app',
    confirm: 'Confirm',
    nothingToConfirmWith: 'Add a passkey or an authenticator app on your account page first.',
  },
  nl: {
    confirmTitle: 'Bevestig dat jij het bent',
    confirmWhy: (minutes: number) => `Dit tonen vraagt in de laatste ${minutes} minuten een passkey of je authenticator-app.`,
    usePasskey: 'Passkey gebruiken',
    authenticatorCode: 'Code uit je authenticator-app',
    confirm: 'Bevestigen',
    nothingToConfirmWith: 'Voeg eerst een passkey of een authenticator-app toe op je accountpagina.',
  },
})
