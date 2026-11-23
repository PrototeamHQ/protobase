import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type MentionableUser, type RecordComment, type ResourcePermissions } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from './app'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Record page/Comments', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

const tickets = resource('tickets')
  .table('tickets')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text(), status: f.enum(['open', 'done']) })
  .primaryKey((r) => r.id)
  .comments()

// Without a layout, the record page ends with Comments by itself
const plainView = view<typeof tickets>('tickets').title((r) => r.title).names({ singular: 'Ticket', plural: 'Tickets' }).fields((r) => ({ status: r.status.valueLabels({ open: 'Open', done: 'Done' }) }))
const laidOutView = plainView.layout((r) => [l.section('Ticket', [r.title, r.status]), l.comments()])

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()
const ann = { id: 'ann', name: 'Ann de Vries' }
const bo = { id: 'bo', name: 'Bo Jansen' }
const comments: Record<string, RecordComment[]> = {
  'tickets/1': [
    { id: '1', createdAt: ago(26), body: 'The printer on the second floor is smoking.', author: ann, mentions: [] },
    { id: '2', createdAt: ago(3), body: '@Ann de Vries I called the supplier,\nthey come tomorrow.', author: bo, mentions: [ann] },
    { id: '3', createdAt: ago(1), body: 'Thanks, I put a sign on it.', author: { id: 'story', name: 'Story User' }, mentions: [] },
  ],
  'tickets/3': [
    {
      id: '4',
      createdAt: ago(2),
      body: '**Heads up @Ann de Vries:** the reset is _done_, ~~tomorrow~~ today.\n\n- run `make reset`\n- check https://status.example.com\n\n> it was the fan\n\n```\nexit **1** <b>\n```',
      author: bo,
      mentions: [ann],
    },
    { id: '5', createdAt: ago(1), body: '[click](javascript:alert(1)) <img src=x onerror="alert(1)">\n[https://acme.example/billing](https://elsewhere.example)', author: ann, mentions: [] },
    { id: '6', createdAt: ago(0.5), body: '> it was the fan\nAgreed, the fan goes.\n>5 failed logins on __init__', author: bo, mentions: [] },
  ],
}
const users: MentionableUser[] = [ann, bo, { id: 'vera', name: 'Vera Vrij' }]

const rows = { tickets: [{ id: 1, title: 'Printer on fire', status: 'open' }, { id: 2, title: 'Broken chair', status: 'open' }, { id: 3, title: 'Server reset', status: 'done' }] }
const permissions: Record<string, ResourcePermissions> = { tickets: { read: true, create: true, update: true, delete: false, conditional: [] } }

const Tickets = ({ laidOut = true, record = 1, onApi }: { laidOut?: boolean; record?: number; onApi?: (api: ReturnType<typeof fakeApi>) => void }) => {
  const [api] = useState(() => {
    const made = fakeApi({ resources: [tickets.toModel()], views: [(laidOut ? laidOutView : plainView).toModel()], rows, permissions, comments, users })
    onApi?.(made)
    return made
  })
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={`/tickets/${record}`} />
    </div>
  )
}

const section = async (canvasElement: HTMLElement) => within((await within(canvasElement).findByRole('heading', { name: 'Comments' })).closest('section')!)

export const Thread: StoryObj = {
  tags: ['play'],
  render: () => <Tickets />,
  play: async ({ canvasElement }) => {
    const thread = await section(canvasElement)
    const items = await thread.findAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^ADAnn de Vries · yesterdayThe printer/),
      expect.stringMatching(/^BJBo Jansen · 3 hours ago@Ann/),
      expect.stringMatching(/^SUStory User · 1 hour agoThanks/),
    ])
    // The mention is picked out, and the comment keeps its line break
    expect(within(items[1]!).getByText('@Ann de Vries').className).toContain('text-primary')
    await waitFor(() => expect(within(items[1]!).getByText('@Ann de Vries').parentElement!.innerHTML).toContain('I called the supplier,<br>they come tomorrow.'))
  },
}

export const Formatted: StoryObj = {
  tags: ['play'],
  render: () => <Tickets record={3} />,
  play: async ({ canvasElement }) => {
    const thread = await section(canvasElement)
    // The thread's own entries, not the list items a formatted comment holds
    const [entries] = await thread.findAllByRole('list')
    const [formatted, unsafe, typed] = [...entries!.children] as HTMLElement[]
    // Each comment formats in a commit of its own once the renderer has loaded, so the story waits on each
    await within(formatted!).findByText('done', { selector: 'em' })
    await within(unsafe!).findByRole('link')
    await waitFor(() => expect(typed!.querySelector('blockquote')).not.toBeNull())
    // A mention inside bold text is still picked out
    const mention = within(formatted!).getByText('@Ann de Vries')
    expect(mention.className).toContain('text-primary')
    expect(mention.closest('strong')).not.toBeNull()
    expect(within(formatted!).getByText('tomorrow').tagName).toBe('DEL')
    expect(within(formatted!).getByText('make reset').tagName).toBe('CODE')
    expect(within(formatted!).getByRole('link', { name: 'https://status.example.com' })).toHaveAttribute('target', '_blank')
    expect(within(formatted!).getByText('it was the fan').closest('blockquote')).not.toBeNull()
    expect(within(formatted!).getByText('exit **1** <b>').tagName).toBe('CODE')
    // A script link and raw HTML show as text
    expect(within(unsafe!).queryByRole('link', { name: 'click' })).toBeNull()
    expect(unsafe!.querySelector('img')).toBeNull()
    expect(unsafe!.textContent).toContain('click <img src=x onerror="alert(1)">')
    // A link whose text names another address shows the address it opens
    expect(within(unsafe!).getByRole('link')).toHaveTextContent('https://elsewhere.example')
    // A reply under a quote is no part of it, and `>5` and `__init__` stay as typed
    expect(typed!.querySelector('blockquote')!.textContent).not.toContain('Agreed')
    expect(typed!.textContent).toContain('>5 failed logins on __init__')
  },
}

export const PostAComment: StoryObj = {
  tags: ['play'],
  render: () => <Tickets />,
  play: async ({ canvasElement }) => {
    const thread = await section(canvasElement)
    const box = await thread.findByRole('combobox', { name: 'Comment' })
    const button = thread.getByRole('button', { name: 'Comment' })
    expect(button).toBeDisabled()
    await userEvent.type(box, 'The sign fell off.')
    await userEvent.click(button)
    await waitFor(() => expect(thread.getAllByRole('listitem').at(-1)!.textContent).toContain('The sign fell off.'))
    expect(box).toHaveValue('')
    // ⌘+Enter posts too
    await userEvent.type(box, 'Put it back.')
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    await waitFor(() => expect(thread.getAllByRole('listitem').at(-1)!.textContent).toContain('Put it back.'))
    expect(box).toHaveValue('')
  },
}

let mentioning: ReturnType<typeof fakeApi> | undefined

export const MentionSomeone: StoryObj = {
  tags: ['play'],
  render: () => <Tickets onApi={(api) => (mentioning = api)} />,
  play: async ({ canvasElement }) => {
    const thread = await section(canvasElement)
    const box = await thread.findByRole('combobox', { name: 'Comment' })
    await userEvent.type(box, 'Thanks @vri')
    const people = await thread.findByRole('listbox', { name: 'People to mention' })
    await waitFor(() => expect(within(people).getAllByRole('option').map((option) => option.textContent)).toEqual(['Ann de Vries', 'Vera Vrij']))
    await userEvent.keyboard('{ArrowDown}')
    expect(within(people).getByRole('option', { selected: true })).toHaveTextContent('Vera Vrij')
    await userEvent.keyboard('{ArrowUp}{Enter}')
    expect(box).toHaveValue('Thanks @Ann de Vries ')
    expect(thread.queryByRole('listbox')).toBeNull()
    await userEvent.type(box, 'for the sign')
    await userEvent.click(thread.getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(mentioning!.comments['tickets/1']).toHaveLength(4))
    expect(mentioning!.comments['tickets/1']!.at(-1)).toMatchObject({ body: 'Thanks @Ann de Vries for the sign', mentions: [ann] })
    await waitFor(() => expect(within(thread.getAllByRole('listitem').at(-1)!).getByText('@Ann de Vries').className).toContain('text-primary'))
    // Escape closes the list, and a name no one has says so
    await userEvent.type(box, '@zz')
    expect(await thread.findByText('No one found')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(thread.queryByRole('listbox')).toBeNull()
  },
}

export const NoComments: StoryObj = {
  tags: ['play'],
  render: () => <Tickets laidOut={false} record={2} />,
  play: async ({ canvasElement }) => {
    const thread = await section(canvasElement)
    expect(await thread.findByText('No comments yet.')).toBeInTheDocument()
    expect(thread.getByRole('combobox', { name: 'Comment' })).toBeInTheDocument()
  },
}

export const OnAPhone: StoryObj = {
  tags: ['play', 'phone'],
  render: () => <Tickets />,
  play: async ({ canvasElement }) => {
    const thread = await section(canvasElement)
    const box = await thread.findByRole('combobox', { name: 'Comment' })
    await userEvent.type(box, 'Ask @b')
    const option = await thread.findByRole('option', { name: 'Bo Jansen' })
    const fits = (element: Element) => element.getBoundingClientRect().right <= document.documentElement.clientWidth
    expect(fits(thread.getByRole('listbox'))).toBe(true)
    // A click picks someone, as the arrows and Enter do
    await userEvent.click(option)
    expect(box).toHaveValue('Ask @Bo Jansen ')
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth)
    for (const item of thread.getAllByRole('listitem')) expect(fits(item)).toBe(true)
  },
}
