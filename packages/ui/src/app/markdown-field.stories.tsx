import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type ResourcePermissions } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from './app'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Record page/Markdown fields', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text(), notes: f.text().optional() })
  .primaryKey((r) => r.id)

const tasksView = view<typeof tasks>('tasks')
  .title((r) => r.title)
  .names({ singular: 'Task', plural: 'Tasks' })
  .fields((r) => ({ notes: r.notes.markdown().label('Worker notes') }))
  .list((r, d) => ({ columns: [r.title, r.notes], displays: [d.cards({ title: r.title, subtitle: r.notes })] }))
  .layout((r) => [l.section('Task', [r.title, r.notes])])

const notes = [
  '## Plan',
  '',
  'Ship the **markdown** field, see [the docs](https://docs.protobase.net).',
  '',
  '- [x] Pick the editor',
  '- Write the `stories`',
  '',
  'Raw <img src=x onerror="window.__pwned = true"> stays text, and [this](javascript:window.__pwned=true) is no link.',
].join('\n')

const rows = { tasks: [{ id: 1, title: 'Markdown editor', notes }] }

/** The rows the fake server holds, so a play can check what a save stored. */
let stored: Record<string, Array<Record<string, unknown>>> = {}

const Tasks = ({ path, canUpdate = true }: { path: string; canUpdate?: boolean }) => {
  const [api] = useState(() => {
    const permissions: Record<string, ResourcePermissions> = { tasks: { read: true, create: true, update: canUpdate, delete: false, conditional: [] } }
    const created = fakeApi({ resources: [tasks.toModel()], views: [tasksView.toModel()], rows: structuredClone(rows), permissions })
    stored = created.rows
    return created
  })
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl={path} />
    </div>
  )
}

const textarea = async (canvasElement: HTMLElement) => {
  await waitFor(() => expect(canvasElement.querySelector('textarea')).toBeTruthy())
  return canvasElement.querySelector('textarea')!
}

// The box shows all of its text: it never scrolls inside.
const showsAll = (box: HTMLElement) => expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight)

// The rendered notes: a heading, a safe link, raw HTML as text and no script link
const rendersNotes = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement)
  await canvas.findByRole('heading', { name: 'Plan', level: 2 })
  const docs = canvas.getByRole('link', { name: 'the docs' })
  expect(docs.getAttribute('href')).toBe('https://docs.protobase.net')
  expect(docs.getAttribute('target')).toBe('_blank')
  expect(docs.getAttribute('rel')).toContain('noopener')
  expect(canvas.getByText(/Raw <img src=x onerror=/)).toBeTruthy()
  expect(canvasElement.querySelector('img[onerror], img[src="x"]')).toBeNull()
  expect(canvas.queryByRole('link', { name: 'this' })).toBeNull()
  expect((window as { __pwned?: boolean }).__pwned).toBeUndefined()
}

export const EditNotes: StoryObj = {
  tags: ['play'],
  render: () => <Tasks path="/tasks/1" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = await textarea(canvasElement)
    // The source shows as written, in a box as tall as it
    expect(box.value).toBe(notes)
    showsAll(box)
    const before = box.offsetHeight
    await userEvent.type(box, '{enter}{enter}### Next{enter}Call **back**')
    await waitFor(() => expect(box.offsetHeight).toBeGreaterThan(before))
    showsAll(box)
    // The preview renders what was typed
    const modes = canvas.getByRole('group', { name: 'Worker notes' })
    await userEvent.click(within(modes).getByRole('button', { name: 'Preview' }))
    await canvas.findByRole('heading', { name: 'Next', level: 3 })
    expect(canvasElement.querySelector('textarea')).toBeNull()
    await rendersNotes(canvasElement)
    await userEvent.click(within(modes).getByRole('button', { name: 'Write' }))
    expect((await textarea(canvasElement)).value).toBe(`${notes}\n\n### Next\nCall **back**`)
    // The text is stored exactly as typed
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(stored.tasks![0]!.notes).toBe(`${notes}\n\n### Next\nCall **back**`))
  },
}

export const NewWithNotes: StoryObj = {
  tags: ['play'],
  render: () => <Tasks path="/tasks/new" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = await textarea(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Preview' }))
    await canvas.findByText('Nothing to preview')
    await userEvent.click(canvas.getByRole('button', { name: 'Write' }))
    await userEvent.type(await textarea(canvasElement), '# Brief{enter}Read _this_ first')
    await userEvent.click(canvas.getByRole('button', { name: 'Preview' }))
    await canvas.findByRole('heading', { name: 'Brief', level: 1 })
    expect(canvas.getByText('this').tagName).toBe('EM')
    expect(box.isConnected).toBe(false)
  },
}

export const ReadNotes: StoryObj = {
  tags: ['play'],
  render: () => <Tasks path="/tasks/1" canUpdate={false} />,
  play: async ({ canvasElement }) => {
    // A reader gets the rendered notes, not the source
    await rendersNotes(canvasElement)
    expect(within(canvasElement).getByRole('checkbox')).toBeDisabled()
    expect(canvasElement.querySelector('textarea')).toBeNull()
  },
}

export const ListShowsAnExcerpt: StoryObj = {
  tags: ['play'],
  render: () => <Tasks path="/tasks" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const cell = await canvas.findByText(/^Plan Ship the markdown field, see the docs\. Pick the editor Write the stories/)
    expect(cell.textContent).not.toContain('**')
    expect(canvas.queryByRole('heading', { name: 'Plan' })).toBeNull()
  },
}

export const CardsRenderNotes: StoryObj = {
  tags: ['play'],
  render: () => <Tasks path="/tasks?display=cards" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = await canvas.findByRole('heading', { name: 'Plan' })
    // The card stays one link to the record: its notes' links show as their text
    const card = heading.closest('a')!
    expect(card.getAttribute('href')).toBe('/tasks/1')
    expect(card.querySelectorAll('a')).toHaveLength(0)
    expect(within(card).getByText('markdown').tagName).toBe('STRONG')
    expect(getComputedStyle(heading.closest('.line-clamp-3')!).webkitLineClamp).toBe('3')
  },
}

const mobile360 = { name: 'Mobile 360', styles: { width: '360px', height: '740px' }, type: 'mobile' }
const onMobile = { parameters: { viewport: { options: { mobile360 } } }, globals: { viewport: { value: 'mobile360' } } }

export const EditOnMobile: StoryObj = {
  ...onMobile,
  tags: ['play', 'phone'],
  name: 'Edit notes on mobile',
  render: () => <Tasks path="/tasks/1" />,
  play: async ({ canvasElement }) => {
    const box = await textarea(canvasElement)
    showsAll(box)
    // The editor fits the width: the page does not scroll sideways
    await waitFor(() => expect(document.scrollingElement!.scrollWidth).toBeLessThanOrEqual(window.innerWidth))
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Preview' }))
    await rendersNotes(canvasElement)
    expect(document.scrollingElement!.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  },
}

export const ReadInDark: StoryObj = {
  tags: ['play'],
  name: 'Read notes in dark',
  globals: { theme: 'dark' },
  render: () => <Tasks path="/tasks/1" canUpdate={false} />,
  play: async ({ canvasElement }) => {
    await rendersNotes(canvasElement)
    // The link takes the theme's link colour, not the browser's blue
    const link = within(canvasElement).getByRole('link', { name: 'the docs' })
    expect(getComputedStyle(link).color).not.toBe('rgb(0, 0, 238)')
  },
}
