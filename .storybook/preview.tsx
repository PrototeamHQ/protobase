import type { Preview } from '@storybook/react-vite'
import { configure } from 'storybook/test'
import '../packages/ui/src/styles.css'
import { writeThemePreference } from '../packages/ui/src/theme/theme-preference'

// A busy CI runner plays four stories at once, so a findBy or waitFor waits 5s rather than testing-library's 1s before
// it gives up.
configure({ asyncUtilTimeout: 5000 })

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Colour theme',
      toolbar: { icon: 'circlehollow', items: ['light', 'dark'], dynamicTitle: true },
    },
    apiBase: {
      description: 'API the Live stories talk to',
      toolbar: { icon: 'server', items: ['/api/v1', 'http://localhost:8787/api/v1', 'http://localhost:8788/api/v1'], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'light', apiBase: '/api/v1' },
  decorators: [
    (Story, context) => {
      // The toolbar's theme is the one picked in this browser too, so an App story draws in it rather than the system's.
      writeThemePreference(localStorage, context.globals.theme)
      document.documentElement.dataset.theme = context.globals.theme
      return <Story />
    },
  ],
  parameters: {
    layout: 'centered',
  },
}

export default preview
