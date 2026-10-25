import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import starlightLinksValidator from 'starlight-links-validator'
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc'
import { features, guides, reference, startHere } from './sidebar.mjs'

export default defineConfig({
  site: 'https://docs.protobase.net',
  integrations: [
    starlight({
      title: 'Protobase',
      description: 'Config-driven admin panel framework for existing Postgres databases.',
      logo: { light: './src/assets/logo.svg', dark: './src/assets/logo-on-dark.svg', alt: 'Protobase', replacesTitle: true },
      head: [{ tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } }],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/PrototeamHQ/protobase' }],
      editLink: { baseUrl: 'https://github.com/PrototeamHQ/protobase/edit/main/website/' },
      // The brand's fonts, served with the site: Instrument Sans with its width axis, and IBM Plex Mono.
      customCss: ['@fontsource-variable/instrument-sans/wdth.css', '@fontsource/ibm-plex-mono/400.css', '@fontsource/ibm-plex-mono/500.css', './src/styles/theme.css'],
      // The schema API reference, generated from its doc comments with the options in typedoc.json.
      plugins: [starlightTypeDoc({ output: 'api/schema', sidebar: { label: 'Schema items', collapsed: true }, typeDoc: { entryFileName: 'index' } }), starlightLinksValidator()],
      sidebar: [
        { label: 'Start here', items: startHere },
        { label: 'Features', items: features, collapsed: true },
        { label: 'Guides', items: [{ label: 'All guides', link: '/guides/' }, ...guides] },
        { label: 'Reference', items: reference },
        { label: 'API', items: [{ label: '@protobase/schema', link: '/api/schema/' }, typeDocSidebarGroup] },
      ],
    }),
  ],
})
