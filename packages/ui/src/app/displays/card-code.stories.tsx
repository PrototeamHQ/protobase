import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'List page/Card code', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@runners.example', name: 'Pip', role: 'admin' })

const runners = resource('runners')
  .table('runners')
  .fields({ id: f.integer().readOnly(), name: f.text(), command: f.text().optional() })
  .primaryKey((r) => r.id)

const runnersView = view<typeof runners>('runners')
  .title((r) => r.name)
  .list((r, d) => ({ columns: [r.name, r.command], displays: [d.cards({ title: r.name, code: r.command })], default: 'cards' }))

const longCommand = "bun run --silent --cwd '/home/worker/projects/protobase' vitest run --changed $(git merge-base HEAD main) --project 'unit*' --reporter=verbose > /home/worker/data/unit.log 2>&1"

const Runners = () => {
  const [api] = useState(() =>
    fakeApi({
      resources: [runners.toModel()],
      views: [runnersView.toModel(runners.toModel())],
      rows: {
        runners: [
          { id: 1, name: 'Runner 1', command: longCommand },
          { id: 2, name: 'Runner 2', command: 'git status' },
          { id: 3, name: 'Runner 3', command: null },
        ],
      },
    }),
  )
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/runners" workspace="Runners" />
    </div>
  )
}

export const CardCode: StoryObj = { name: 'Cards with a command in full', render: () => <Runners /> }

export const CardCodeChecks: StoryObj = {
  ...CardCode,
  name: 'Cards with a command in full (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The long command shows whole, wrapped onto several lines inside its card rather than cut off or scrolled
    const command = await canvas.findByText(longCommand)
    expect(command.tagName).toBe('PRE')
    expect(getComputedStyle(command).whiteSpace).toBe('pre-wrap')
    expect(command.scrollWidth).toBeLessThanOrEqual(command.clientWidth)
    expect(command.getBoundingClientRect().height).toBeGreaterThan(2 * parseFloat(getComputedStyle(command).lineHeight))
    // A runner without a command shows no empty block
    expect(canvas.getByRole('link', { name: /^Runner 3/ }).querySelector('pre')).toBeNull()
  },
}
