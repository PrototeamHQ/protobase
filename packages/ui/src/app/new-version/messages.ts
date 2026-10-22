import { defineMessages } from '../locale/messages'

export const text = defineMessages({
  en: {
    title: 'A new version is available',
    description: (version?: string) => `Reload the page to use ${version ? `Protobase ${version}` : 'it'}. Until then, this page stays as it is.`,
    reload: 'Reload',
  },
  nl: {
    title: 'Er is een nieuwe versie',
    description: (version?: string) => `Laad de pagina opnieuw om ${version ? `Protobase ${version}` : 'die'} te gebruiken. Tot dan blijft deze pagina zoals hij is.`,
    reload: 'Opnieuw laden',
  },
})
