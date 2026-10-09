import type { StorybookConfig } from '@storybook/react-vite'
import tailwindcss from '@tailwindcss/vite'
import { mergeConfig } from 'vite'

const config: StorybookConfig = {
  stories: ['../packages/*/src/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs'],
  framework: '@storybook/react-vite',
  viteFinal: (viteConfig) =>
    mergeConfig(viteConfig, {
      plugins: [tailwindcss()],
      // Live stories call /api/v1 on the Storybook origin; PROTOBASE_API says where the ERP server runs.
      server: { proxy: { '/api': { target: process.env.PROTOBASE_API ?? 'http://localhost:8787', changeOrigin: true } } },
    }),
}

export default config
