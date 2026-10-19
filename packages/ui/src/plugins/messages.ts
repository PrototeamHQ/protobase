import { defineMessages } from '../locale/messages'

export const text = defineMessages({
  en: {
    loading: 'Loading',
    pluginsOff: 'Plugins off',
    pluginOff: 'The plugin {} is off: {}.',
    dismiss: 'Dismiss',
    answered: (status: number) => `its plugin.json answered ${status}`,
    couldNotLoad: (reason: string) => `it could not be loaded: ${reason}`,
    notObject: 'its plugin.json is not an object',
    noName: 'its plugin.json names no plugin',
    noApi: 'its plugin.json names no plugin API',
    noVersions: 'its plugin.json names no Protobase versions',
    noModule: 'its plugin.json names no module',
    badStylesheet: 'its plugin.json names a stylesheet that is no URL',
    badVersion: 'its plugin.json has a version that is no text',
  },
  nl: {
    loading: 'Laden',
    pluginsOff: 'Plug-ins uit',
    pluginOff: 'De plug-in {} staat uit: {}.',
    dismiss: 'Sluiten',
    answered: (status: number) => `de plugin.json antwoordde ${status}`,
    couldNotLoad: (reason: string) => `hij kon niet worden geladen: ${reason}`,
    notObject: 'de plugin.json is geen object',
    noName: 'de plugin.json noemt geen plug-in',
    noApi: 'de plugin.json noemt geen plug-in-API',
    noVersions: 'de plugin.json noemt geen Protobase-versies',
    noModule: 'de plugin.json noemt geen module',
    badStylesheet: 'de plugin.json noemt een stylesheet die geen URL is',
    badVersion: 'de plugin.json heeft een versie die geen tekst is',
  },
})
