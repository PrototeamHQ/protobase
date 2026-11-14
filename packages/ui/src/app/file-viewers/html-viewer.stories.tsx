import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import { createStaticSession, type ResourcePermissions } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'
import { tallPng, tallWebm } from './html-viewer.fixtures'

// What a page's script would post to the app if it ran; every story expects none.
const heard: string[] = []
const hear = (event: MessageEvent) => typeof event.data === 'string' && heard.push(event.data)

const meta = {
  title: 'Record page/HTML viewer',
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    heard.length = 0
    window.addEventListener('message', hear)
    return () => window.removeEventListener('message', hear)
  },
} satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

const attachments = resource('attachments')
  .table('attachments')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    task_id: f.relation('tasks').optional().filterable(),
    file: f.file(),
  })
  .primaryKey((r) => r.id)
const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly().filterable(), title: f.text() })
  .primaryKey((r) => r.id)
const attachmentsView = view<typeof attachments>('attachments').names({ singular: 'File', plural: 'Files' }).list((r) => ({ columns: [r.file, r.task_id] }))
const tasksView = view<typeof tasks>('tasks').title((r) => r.title).names({ singular: 'Task', plural: 'Tasks' })

// Each link of a page sits in a 40 px slot from its top, where a story clicks it.
const slots = `<style>body { margin: 0; font: 16px sans-serif } .slot { display: block; height: 40px } img, video { display: block }</style>`

// Its links, then a 300 px image and a 400 px video: 860 px tall once both are drawn, 310 px when neither is.
const report = `<!doctype html><html><head>${slots}</head><body>
<a class="slot" href="other.html">Other page</a>
<a class="slot" href="other.html">Other page in a new tab</a>
<a class="slot" href="notes.txt">Notes</a>
<a class="slot" href="https://site.test/page" target="_blank">Site</a>
<img src="shots/a.png" alt="">
<video src="./clip.webm" preload="auto" muted></video>
</body></html>`

const other = `<!doctype html><html><head>${slots}</head><body><script>parent.postMessage('ran: the other page', '*')</script><img src="a.png" alt=""></body></html>`

// Every way out of the frame this page tries would post or request something.
const hostile = `<script>parent.postMessage('ran: before html', '*')</script>
<html><head><script>parent.postMessage('ran: in head', '*')</script>
<meta http-equiv="refresh" content="1;url=https://evil.test/refresh">
<base href="https://evil.test/" target="_top">
<link rel="stylesheet" href="https://evil.test/style.css"><link rel="prefetch" href="https://evil.test/prefetch">
${slots}<style>.bg { background: url(https://evil.test/bg.png) }</style></head><body>
<a class="slot" href="https://evil.test/top" target="_top">Top</a>
<a class="slot" href="javascript:parent.postMessage('ran: javascript link', '*')">Script link</a>
<a class="slot" href="data:text/html,<script>parent.postMessage('ran: data link', '*')</script>">Data link</a>
<form class="slot" action="https://evil.test/form" target="_top"><button style="height: 40px">Send</button></form>
<a class="slot" href="missing.html">Missing</a>
<img src="x" onerror="parent.postMessage('ran: onerror', '*')">
<svg onload="parent.postMessage('ran: svg onload', '*')"></svg>
<svg><script>parent.postMessage('ran: svg script', '*')</script></svg>
<math><mtext><table><mglyph><style><img src="x" onerror="parent.postMessage('ran: math', '*')"></style></mglyph></table></mtext></math>
<noscript><p title="</noscript><img src=x onerror=parent.postMessage('ran:noscript','*')>"></p></noscript>
<template><script>parent.postMessage('ran: template', '*')</script></template>
<style></style><script>parent.postMessage('ran: after style', '*')</script>
<script nonce="">parent.postMessage('ran: empty nonce', '*')</script>
<script nonce="guess">parent.postMessage('ran: guessed nonce', '*')</script>
<div class="bg" style="height: 10px; background-image: url(https://evil.test/inline.png)"></div>
<img src="https://evil.test/beacon.png" srcset="a.png 1x, //evil.test/b.png 2x" alt="">
<video src="https://evil.test/v.webm" poster="//evil.test/p.jpg"></video>
<object data="https://evil.test/o"></object>
<iframe src="https://evil.test/f"></iframe>
<img src="missing.png" alt="">
</body></html>`

const broken = `<!doctype html><html><head>${slots}</head><body><img src="gone.png" alt=""></body></html>`

const html = (text: string) => `data:text/html;base64,${btoa(text)}`
const stored = (id: number, name: string, type: string, url: string) => ({ id, task_id: 7, file: { uri: `private:1/${id}?name=${name}`, name, type, size: 100, url } })
// An address the files of a built Storybook answer with a 404.
const gone = (name: string) => `http://files.localhost/${name}`

const rows = {
  tasks: [{ id: 7, title: 'Ship the report' }],
  attachments: [
    stored(1, 'report.html', 'text/html', html(report)),
    stored(2, 'other.html', 'text/html', html(other)),
    stored(3, 'a.png', 'image/png', tallPng),
    stored(4, 'clip.webm', 'video/webm', tallWebm),
    stored(5, 'notes.txt', 'text/plain', 'data:text/plain,notes'),
    stored(6, 'hostile.html', 'text/html', html(hostile)),
    stored(7, 'broken.html', 'text/html', html(broken)),
    stored(8, 'gone.png', 'image/png', gone('gone.png')),
    { id: 9, task_id: null, file: { uri: 'private:1/9?name=unreadable.html', name: 'unreadable.html', type: 'text/html', size: 100, url: gone('unreadable.html') } },
  ],
}

const permissions: Record<string, ResourcePermissions> = {
  tasks: { read: true, create: false, update: false, delete: false, conditional: [] },
  attachments: { read: true, create: false, update: false, delete: false, conditional: [] },
}

const Files = ({ path }: { path: string }) => {
  const [api] = useState(() => fakeApi({ resources: [tasks.toModel(), attachments.toModel()], views: [tasksView.toModel(), attachmentsView.toModel()], rows, permissions }))
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl={path} />
    </div>
  )
}

const click = (at: { x: number; y: number; button?: 'left' | 'middle' }) => (window as unknown as { pbClick: (at: { x: number; y: number; button?: 'left' | 'middle' }) => Promise<void> }).pbClick(at)

// Clicks the link in slot `slot` of `frame` with the real mouse.
const clickSlot = (frame: HTMLElement, slot: number, button?: 'middle') => {
  const box = frame.getBoundingClientRect()
  return click({ x: box.left + 20, y: box.top + slot * 40 + 20, ...(button && { button }) })
}

// Waits for the height the frame's page reported, past the room the frame keeps for it until then.
const reportedHeight = (frame: HTMLElement) =>
  waitFor(
    () => {
      expect(frame.style.height).not.toBe('')
      return frame.getBoundingClientRect().height
    },
    { timeout: 10_000 },
  )

const tallerThan = (frame: HTMLElement, px: number) => waitFor(async () => expect(await reportedHeight(frame)).toBeGreaterThan(px), { timeout: 10_000 })

// The frame that shows `name`, once it shows.
const frameOf = (root: HTMLElement, name: string) =>
  waitFor(
    () => {
      const frame = root.querySelector<HTMLIFrameElement>(`iframe[title="${name}"]`)
      if (!frame) throw new Error(`No frame shows ${name}`)
      return frame
    },
    { timeout: 10_000 },
  )

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** An uploaded page shows in its sandboxed frame with its sibling image and video, and its link opens the other page, with its own image. */
export const DrawsItsFilesAndFollowsALink: StoryObj = {
  tags: ['play', 'mouse', 'sealed-frames'],
  render: () => <Files path="/attachments/1?file=file" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const frame = await frameOf(canvasElement, 'report.html')
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
    expect(frame).not.toHaveAttribute('src')
    await tallerThan(frame, 850)

    await clickSlot(frame, 0)
    expect(await canvas.findByRole('heading', { name: /^other\.html/ })).toBeTruthy()
    await tallerThan(await frameOf(canvasElement, 'other.html'), 290)
    expect(heard).toEqual([])
  },
}

/** A middle click opens a sibling's page in a new tab; a file with no viewer and an outside page open in new tabs that cannot reach the app. */
export const OpensOtherLinksInNewTabs: StoryObj = {
  tags: ['play', 'mouse', 'sealed-frames'],
  render: () => <Files path="/attachments/1?file=file" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const opened: unknown[][] = []
    const open = window.open
    window.open = (...args: unknown[]) => {
      opened.push(args)
      return null
    }
    try {
      const frame = await frameOf(canvasElement, 'report.html')
      await tallerThan(frame, 850)
      await clickSlot(frame, 1, 'middle')
      await clickSlot(frame, 2)
      await clickSlot(frame, 3)
      await waitFor(() => expect(opened).toHaveLength(3))
      expect(opened).toEqual([
        [expect.stringMatching(/\/attachments\/2\?file=file$/), '_blank', 'noopener,noreferrer'],
        ['data:text/plain,notes', '_blank', 'noopener,noreferrer'],
        ['https://site.test/page', '_blank', 'noopener,noreferrer'],
      ])
      expect(canvas.getByRole('heading', { name: /^report\.html/ })).toBeTruthy()
    } finally {
      window.open = open
    }
  },
}

/** A page's scripts, handlers, forms, refreshes and outside addresses do nothing: the app stays where it was, and nothing is requested. */
export const KeepsTheAppOutOfReach: StoryObj = {
  tags: ['play', 'mouse', 'sealed-frames'],
  render: () => <Files path="/attachments/6?file=file" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const frame = await frameOf(canvasElement, 'hostile.html')
    // The frame's own script reports the page's height, so it ran where the page's did not.
    await reportedHeight(frame)
    const address = window.location.href
    for (const slot of [0, 1, 2, 3, 4]) await clickSlot(frame, slot)
    // Past the refresh the page asks for after a second.
    await pause(1500)
    expect(window.location.href).toBe(address)
    expect(canvas.getByRole('heading', { name: /^hostile\.html/ })).toBeTruthy()
    expect(canvasElement.querySelector('iframe[title="hostile.html"]')).toBe(frame)
    expect(heard).toEqual([])
  },
}

/** A sibling that cannot be read stays a broken reference in the sandboxed page, and a page that cannot be read offers its download. */
export const FailsClosed: StoryObj = {
  tags: ['play', 'sealed-frames'],
  render: () => <Files path="/attachments/7?file=file" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const frame = await frameOf(canvasElement, 'broken.html')
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
    expect(await reportedHeight(frame)).toBeLessThan(100)
  },
}

/** A page the app cannot read leaves its download in its place. */
export const UnreadablePage: StoryObj = {
  tags: ['play'],
  render: () => <Files path="/attachments/9?file=file" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('alert', {}, { timeout: 10_000 })).toHaveTextContent('unreadable.html could not be shown here.')
  },
}
