import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import starlightLinksValidator from 'starlight-links-validator'
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc'
import { guides, reference, startHere } from './sidebar.mjs'

export default defineConfig({
  site: 'https://docs.protobase.net',
  integrations: [
    starlight({
      title: 'Protobase',
      description: 'Config-driven admin panel framework for existing Postgres databases.',
      logo: { src: './src/assets/logo.svg' },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/PrototeamHQ/protobase' }],
      editLink: { baseUrl: 'https://github.com/PrototeamHQ/protobase/edit/main/website/' },
      customCss: ['./src/styles/theme.css'],
      // The schema API reference, generated from its doc comments with the options in typedoc.json.
      plugins: [starlightTypeDoc({ output: 'api/schema', sidebar: { label: 'Schema items', collapsed: true }, typeDoc: { entryFileName: 'index' } }), starlightLinksValidator()],
      sidebar: [
        { label: 'Start here', items: startHere },
        { label: 'Guides', items: guides },
        { label: 'Reference', items: reference },
        { label: 'API', items: [{ label: '@protobase/schema', link: '/api/schema/' }, typeDocSidebarGroup] },
      ],
    }),
  ],
})
