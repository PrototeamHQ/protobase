import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession, type AuthSession, type LiveHandlers, type UploadOptions, type UploadResult } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Record page/Conversation page/Files', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

// A channel whose messages carry files, kept in a resource of their own, configured with no component of the app's own

const channels = resource('channels')
  .table('channels')
  .fields({ id: f.integer().readOnly().filterable().sortable(), name: f.text().sortable() })
  .primaryKey((r) => r.id)

const messages = resource('messages')
  .table('messages')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    channel_id: f.relation('channels').filterable(),
    author_id: f.text().readOnly().filterable(),
    body: f.text().optional(),
    sent_at: f.timestamp().readOnly().sortable(),
  })
  .primaryKey((r) => r.id)
  .author((r) => r.author_id)

// A file may be at most 1 kB here, so a play can pick one too large without a large file
const attachments = resource('attachments')
  .table('attachments')
  .fields({
    id: f.integer().readOnly().filterable(),
    message_id: f.relation('messages').filterable(),
    file: f.file().maxSize(1_000),
    width: f.integer().readOnly().optional(),
    height: f.integer().readOnly().optional(),
  })
  .primaryKey((r) => r.id)

const channelsView = view<typeof channels>('channels')
  .names({ singular: 'Channel', plural: 'Channels' })
  .title((r) => r.name)
  .nav({ recent: { orderBy: 'name asc' } })
  .record({
    conversation: {
      resource: 'messages',
      field: 'channel_id',
      sender: 'author_id',
      time: 'sent_at',
      text: 'body',
      delete: true,
      attachments: { resource: 'attachments', field: 'message_id', file: 'file', width: 'width', height: 'height' },
    },
  })

const hidden = (name: string) => view(name).nav({ hidden: true })

const acme = { id: 'org-acme', name: 'Acme', slug: 'acme' }

// Maya, a member of Acme
const session = (): AuthSession => {
  const base = createStaticSession('story-token', { id: 'u-maya', email: 'maya@acme.example', name: 'Maya Jansen', role: 'user' })
  return {
    ...base,
    status: async () => ({ ...(await base.status()), organizations: { create: 'everyone', roles: [] } }),
    organizations: {
      ...base.organizations,
      current: async () => ({ organization: acme, role: 'member', appRoles: [], memberId: 'm-maya', globalRoles: [] }),
      list: async () => [acme],
      people: async () => [
        { id: 'u-maya', name: 'Maya Jansen' },
        { id: 'u-sam', name: 'Sam Okafor' },
      ],
    },
  }
}

// Today at a time of day, so the messages fall on one day whenever the story runs
const today = (hours: number, minutes: number) => {
  const at = new Date()
  at.setHours(hours, minutes, 0, 0)
  return at.toISOString()
}

// A chart drawn in the browser, wider than a message, which the preview scales down
const chart = () => {
  const canvas = document.createElement('canvas')
  Object.assign(canvas, { width: 960, height: 540 })
  const context = canvas.getContext('2d')!
  context.fillStyle = '#eef2ff'
  context.fillRect(0, 0, 960, 540)
  context.fillStyle = '#6366f1'
  for (const [index, height] of [180, 260, 220, 380, 450].entries()) context.fillRect(80 + index * 170, 500 - height, 120, height)
  return canvas.toDataURL('image/png')
}

const rows = () => ({
  channels: [{ id: 1, name: 'general' }],
  messages: [
    { id: 1, channel_id: 1, author_id: 'u-sam', body: 'The quarter so far', sent_at: today(9, 0) },
    { id: 2, channel_id: 1, author_id: 'u-sam', body: 'And the plan', sent_at: today(9, 2) },
  ],
  attachments: [
    { id: 1, message_id: 1, file: { uri: 'private:1/q3.png', name: 'q3.png', type: 'image/png', size: 48_211, url: chart() }, width: 960, height: 540 },
    { id: 2, message_id: 2, file: { uri: 'private:1/plan.pdf', name: 'plan.pdf', type: 'application/pdf', size: 1_250_000, url: 'data:application/pdf;base64,JVBERi0=' }, width: null, height: null },
  ],
})

/** The rows the fake server holds, so a play can check what the page wrote. */
let stored: Record<string, Array<Record<string, unknown>>> = {}

/** The files the page uploaded, by name, so a play can tell one refused before its upload from one the server refused. */
let uploaded: string[] = []

/** Finishes the held upload of a file named `slow.txt`, which stays half sent until a play calls it. */
let releaseSlowUpload: () => void = () => undefined

// Like the server: an executable is refused, and `slow.txt` takes its time
const upload = async (_resource: string, _field: string, file: File, options: UploadOptions): Promise<UploadResult> => {
  uploaded.push(file.name)
  if (file.name.endsWith('.exe')) throw new ApiError({ type: 'urn:protobase:problem:invalid-argument', title: 'Bad Request', status: 400, detail: 'This type of file is not accepted' })
  if (file.name === 'slow.txt') {
    options.onProgress?.(file.size / 2, file.size)
    await new Promise<void>((resolve) => (releaseSlowUpload = resolve))
  }
  return { value: `ticket:${file.name}`, file: { name: file.name, type: file.type || 'application/octet-stream', size: file.size }, derived: {} }
}

const Chat = () => {
  const [client] = useState(() => {
    uploaded = []
    const created = fakeApi({
      resources: [channels.toModel(), messages.toModel(), attachments.toModel()],
      views: [channelsView.toModel(channels.toModel()), hidden('messages').toModel(), hidden('attachments').toModel()],
      rows: rows(),
      upload,
      bottomBar: { label: 'Chat', items: [{ kind: 'resource', resource: 'channels', label: 'Channels' }] },
      // Like the server, a create stamps a message's author and time
      beforeWrite: (name, row) => {
        if (name === 'messages' && !row.sent_at) Object.assign(row, { author_id: 'u-maya', sent_at: new Date().toISOString() })
      },
    })
    stored = created.rows
    return { ...created.client, live: (_handlers: LiveHandlers) => () => undefined }
  })
  return (
    <div className="h-screen">
      <App client={client} auth={session()} initialUrl="/channels/1" workspace="Acme" />
    </div>
  )
}

/** An image under its message as a preview, another file as a download link with its name and size. */
export const MessageFiles: StoryObj = { name: 'Files under their messages', render: () => <Chat /> }

// The message's row in the conversation, found by a link it holds
const rowWith = async (canvasElement: HTMLElement, name: string | RegExp) => {
  const log = await within(canvasElement).findByRole('log')
  return (await within(log).findByRole('link', { name })).closest<HTMLElement>('[data-message]')!
}

// Dialogs open over the page, outside the story's root
const screen = within(document.body)

export const FilesChecks: StoryObj = {
  ...MessageFiles,
  name: 'Pick files, see their progress or refusal, send them, delete them with the message (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // An image previews at most 240 px high, inside a link that opens it; another file downloads by its name and size
    const preview = await canvas.findByRole('img', { name: 'q3.png' })
    await waitFor(() => expect(preview.getBoundingClientRect().height).toBeLessThanOrEqual(240))
    expect(preview.closest('a')).toHaveAttribute('target', '_blank')
    const pdf = await canvas.findByRole('link', { name: /plan\.pdf/ })
    expect(pdf).toHaveAttribute('download', 'plan.pdf')
    expect(pdf).toHaveTextContent('1.3 MB')

    // Picked files upload at once and show above the box: one on its way with its progress, one too large refused
    // before its upload, one the server refuses with its reason
    const box = canvas.getByRole('textbox', { name: 'Message' })
    const send = canvas.getByRole('button', { name: 'Send' })
    await userEvent.upload(canvas.getByLabelText('Files to attach'), [
      new File(['x'.repeat(200)], 'slow.txt', { type: 'text/plain' }),
      new File(['x'.repeat(2_000)], 'big.mov', { type: 'video/quicktime' }),
      new File(['x'], 'tool.exe', { type: 'application/octet-stream' }),
    ])
    const tray = within(await canvas.findByRole('list', { name: 'Files to send' }))
    await waitFor(() => expect(tray.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['slow.txt50%', 'big.movToo large: 2.0 kB, at most 1.0 kB', 'tool.exeNot uploaded: This type of file is not accepted']))
    expect(uploaded).toEqual(['slow.txt', 'tool.exe'])

    // The message waits for the upload still on its way, even with text
    await userEvent.type(box, 'Notes')
    expect(send).toBeDisabled()
    await userEvent.clear(box)
    releaseSlowUpload()
    await waitFor(() => expect(tray.getAllByRole('listitem')[0]).toHaveTextContent('slow.txt200 bytes'))

    // A refused file is taken off; with one uploaded, the message goes without text
    await userEvent.click(tray.getByRole('button', { name: 'Take big.mov off' }))
    expect(tray.getAllByRole('listitem')).toHaveLength(2)
    expect(send).toBeEnabled()
    await userEvent.click(send)
    await waitFor(() => expect(stored.attachments).toHaveLength(3))
    const file = stored.attachments!.at(-1)!
    expect(file.file).toMatchObject({ name: 'slow.txt' })
    expect(stored.messages!.find((row) => row.id === file.message_id)).not.toHaveProperty('body')
    await waitFor(() => expect(canvas.queryByRole('list', { name: 'Files to send' })).toBeNull())
    const sent = await rowWith(canvasElement, /slow\.txt/)

    // Deleting the message deletes its file first
    within(sent).getByRole('toolbar', { name: 'Message actions' }).querySelector<HTMLElement>('button')!.focus()
    await userEvent.click(within(sent).getByRole('button', { name: 'Delete' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete this message?' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(stored.messages!.map((row) => row.id)).toEqual([1, 2]))
    expect(stored.attachments!.map((row) => row.id)).toEqual([1, 2])
  },
}
