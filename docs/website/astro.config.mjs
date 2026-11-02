import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import starlightLinksValidator from 'starlight-links-validator'
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc'
import { architecture, features, featuresPage, gettingStarted, guides, referenceGroups } from './sidebar.mjs'
import { description } from './site.mjs'

export default defineConfig({
  site: 'https://docs.protobase.net',
  integrations: [
    starlight({
      title: 'Protobase',
      description,
      logo: { light: './src/assets/logo.svg', dark: './src/assets/logo-on-dark.svg', alt: 'Protobase', replacesTitle: true },
      head: [{ tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } }],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/PrototeamHQ/protobase' }],
      editLink: { baseUrl: 'https://github.com/PrototeamHQ/protobase/edit/main/docs/website/' },
      // The brand's fonts, served with the site: Instrument Sans with its width axis, and IBM Plex Mono.
      customCss: ['@fontsource-variable/instrument-sans/wdth.css', '@fontsource/ibm-plex-mono/400.css', '@fontsource/ibm-plex-mono/500.css', './src/styles/theme.css'],
      // The schema API reference, generated from its doc comments with the options in typedoc.json.
      plugins: [starlightTypeDoc({ output: 'api/schema', sidebar: { label: 'Schema items', collapsed: true }, typeDoc: { entryFileName: 'index' } }), starlightLinksValidator()],
      sidebar: [
        gettingStarted,
        { label: 'Reference', items: referenceGroups.map((group) => ({ ...group, collapsed: true })) },
        { label: 'Guides', items: [{ label: 'All guides', link: '/guides/' }, ...guides] },
        { label: 'Features', items: [featuresPage, ...features], collapsed: true },
        { label: 'Architecture', items: architecture },
        { label: 'API', items: [{ label: '@protobase/schema', link: '/api/schema/' }, typeDocSidebarGroup] },
      ],
    }),
  ],
})
