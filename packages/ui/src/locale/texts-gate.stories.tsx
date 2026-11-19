import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { TextsBoundary } from './texts-gate'

const meta = { title: 'App/Texts that do not load', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

// What the gate's wait throws when a language's texts do not load
const FailedLoad = () => {
  throw new Error('Failed to fetch dynamically imported module: /assets/nl.js')
}

/** A language whose texts do not load, such as offline after the app switched to it: the screens say so and offer to load the page again. */
export const DoNotLoad: StoryObj = {
  tags: ['play'],
  render: () => (
    <div className="h-dvh">
      <TextsBoundary>
        <FailedLoad />
      </TextsBoundary>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const alert = await within(canvasElement).findByRole('alert')
    expect(alert).toHaveTextContent('The app did not load. Check your connection, then try again.')
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeVisible()
  },
}
