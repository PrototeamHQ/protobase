import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import starlightLinksValidator from 'starlight-links-validator'

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
      plugins: [starlightLinksValidator()],
      sidebar: [
        { label: 'Start here', items: ['getting-started', 'guides/deploy'] },
        { label: 'Guides', items: ['guides/table-to-admin', 'guides/first-composed-page', 'guides/billing-page'] },
        {
          label: 'Reference',
          items: [
            'reference/data-config',
            'reference/ui-config',
            'reference/architecture',
            'reference/api',
            'reference/access',
            'reference/auth',
            'reference/client',
            'reference/layouts',
            'reference/blocks',
            'reference/custom-components',
            'reference/sidebar',
            'reference/user-menu',
            'reference/cli',
            'reference/versioning',
          ],
        },
      ],
    }),
  ],
})
