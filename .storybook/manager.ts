import { addons } from 'storybook/manager-api'
import { create } from 'storybook/theming'

// Protobase's lockup at the top of Storybook's sidebar, on light or dark as the system is, which Storybook follows too.
const dark = matchMedia('(prefers-color-scheme: dark)').matches

addons.setConfig({
  theme: create({
    base: dark ? 'dark' : 'light',
    brandTitle: 'Protobase',
    brandUrl: 'https://docs.protobase.net',
    brandImage: dark ? './protobase-logo-on-dark.svg' : './protobase-logo.svg',
    brandTarget: '_self',
  }),
})
