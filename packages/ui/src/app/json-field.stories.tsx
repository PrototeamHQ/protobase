import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from './app'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Record page/JSON fields', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

const runs = resource('runs')
  .table('runs')
  .fields({ id: f.integer().readOnly().filterable().sortable(), name: f.text(), input: f.json().optional() })
  .primaryKey((r) => r.id)

const runsView = view<typeof runs>('runs')
  .title((r) => r.name)
  .names({ singular: 'Run', plural: 'Runs' })
  .list((r) => ({ columns: [r.name, r.input] }))
  .layout((r) => [l.section('Run', [r.name, r.input])])

// An input of 60 keys, 62 lines once written out
const input = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`setting_${i + 1}`, `value ${i + 1}`]))

const Runs = () => {
  const [api] = useState(() => fakeApi({ resources: [runs.toModel()], views: [runsView.toModel()], rows: { runs: [{ id: 1, name: 'Nightly import', input }] } }))
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl="/runs/1" />
    </div>
  )
}

const shownLines = (canvasElement: HTMLElement) => canvasElement.querySelector('pre')!.textContent!.split('\n').length

/** A long JSON value shows its first 20 lines and a button that shows all of them, and the page keeps its width. */
const foldsChecks = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement)
  const showAll = await canvas.findByRole('button', { name: 'Show all 62 lines' })
  expect(showAll.getAttribute('aria-expanded')).toBe('false')
  expect(shownLines(canvasElement)).toBe(20)
  await userEvent.click(showAll)
  const showLess = await canvas.findByRole('button', { name: 'Show less' })
  expect(showLess.getAttribute('aria-expanded')).toBe('true')
  expect(shownLines(canvasElement)).toBe(62)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth)
  await userEvent.click(showLess)
  expect(shownLines(canvasElement)).toBe(20)
}

export const LongValue: StoryObj = { name: 'A long value folds', render: () => <Runs /> }

export const LongValueChecks: StoryObj = { tags: ['play', '!dev'], name: 'A long value folds (checks)', render: () => <Runs />, play: foldsChecks }

export const LongValueOnPhoneChecks: StoryObj = { tags: ['play', 'phone', '!dev'], name: 'A long value folds on a phone (checks)', render: () => <Runs />, play: foldsChecks }
