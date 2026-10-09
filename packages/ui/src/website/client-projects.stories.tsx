import type { Meta, StoryObj } from '@storybook/react-vite'
import { ClientProjects as ClientProjectsView } from '../client-projects'
import { Screen } from './screen'

const meta = { title: 'Website/ClientProjects', tags: ['website'], parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

export const ClientProjects: StoryObj = {
  render: () => (
    <Screen>
      <ClientProjectsView />
    </Screen>
  ),
}
