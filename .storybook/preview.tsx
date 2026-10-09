import type { Preview } from '@storybook/react-vite'
import '../packages/ui/src/styles.css'

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
      document.documentElement.dataset.theme = context.globals.theme
      return <Story />
    },
  ],
  parameters: {
    layout: 'centered',
  },
}

export default preview
