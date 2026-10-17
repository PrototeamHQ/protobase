import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'
import { objectiveResources, objectiveRows, objectiveViews } from '../testing/objectives-domain'

const meta = { title: 'List page/Related records as dots', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'manager' })

const Objectives = () => {
  const [api] = useState(() => fakeApi({ resources: objectiveResources, views: objectiveViews, rows: objectiveRows }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/objectives" />
    </div>
  )
}

/** Each objective's tasks as dots in their status's colour: done green, blocked red, the others in their badge tone. */
export const MixedStates: StoryObj = {
  tags: ['play'],
  render: () => <Objectives />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // A task that serves two objectives has a dot in both rows; one without tasks has none
    const dots = await canvas.findAllByRole('link', { name: 'Dots column, Doing' }, { timeout: 5000 })
    expect(dots).toHaveLength(2)
    const dot = dots[0]!
    expect(dot.getAttribute('href')).toBe('/tasks/2')
    expect(canvas.getByText('4 tasks: 2 To do, 1 Doing, 1 Done')).toBeInTheDocument()
    expect(canvas.getByText('2 tasks: 2 Done')).toBeInTheDocument()
    expect(canvas.getByText('No tasks')).toBeInTheDocument()
    expect((canvas.getByRole('link', { name: 'Link table for objectives, Done' }).firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(22, 163, 74)')
    // Hovering a dot shows the task's card, a link to the task with its owner and status
    await userEvent.hover(dot)
    const body = within(canvasElement.ownerDocument.body)
    const card = await waitFor(() => {
      const found = canvasElement.ownerDocument.querySelector('[data-dot-card] a')
      if (!found) throw new Error('no card yet')
      return found as HTMLAnchorElement
    })
    expect(card.getAttribute('href')).toBe('/tasks/2')
    expect(card.textContent).toContain('Bram')
    expect(within(card).getByText('Doing')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(body.queryByText('Bram', { selector: '[data-dot-card] *' })).toBeNull())
  },
}
