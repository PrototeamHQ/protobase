import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { Diff, Page, RecordCard, page } from '@protobase/layout'
import { f, resource, view } from '@protobase/schema'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'

const viewports = {
  phone390: { name: 'Phone 390', styles: { width: '390px', height: '844px' }, type: 'mobile' },
  desktop1280: { name: 'Desktop 1280', styles: { width: '1280px', height: '800px' }, type: 'desktop' },
} as const

const meta = { title: 'Composed pages/Diff', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// A proposed change to an invoicing app: its patch over two files, and a note that is no patch

const changes = resource('changes')
  .table('changes')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text(), patch: f.text().optional(), note: f.text().optional() })
  .primaryKey((r) => r.id)

const changesView = view<typeof changes>('changes').title((r) => r.title).names({ singular: 'Change', plural: 'Changes' })

const patch = `diff --git a/src/total.ts b/src/total.ts
index 3b18e51..a1f2c3d 100644
--- a/src/total.ts
+++ b/src/total.ts
@@ -10,4 +10,5 @@ export const total = (lines: Line[]) =>
   lines
-    .map((line) => line.price)
+    .map((line) => line.price * line.quantity)
+    .filter(Boolean)
     .reduce(sum, 0)
 
diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1,3 +1,3 @@
 # Invoices
 
-Totals add up the prices.
+Totals add up each price times its quantity.
`

const change = page(
  'change',
  Page({
    title: 'Change',
    children: RecordCard({
      resource: 'changes',
      recordKey: '1',
      title: 'Proposed change',
      children: [Diff({ source: 'patch', emptyText: 'No changes' }), Diff({ source: 'note' })],
    }),
  }),
)

const Change = () => {
  const [api] = useState(() =>
    fakeApi({
      resources: [changes.toModel()],
      views: [changesView.toModel()],
      pages: [change.toModel()],
      rows: { changes: [{ id: 1, title: 'Count quantities in totals', patch, note: 'Reviewed with the finance team.\nShip it.' }] },
    }),
  )
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl="/change" />
    </div>
  )
}

export const Desktop: StoryObj = { name: 'A two-file patch, side by side', globals: { viewport: { value: 'desktop1280' } }, render: () => <Change /> }

export const Phone: StoryObj = { ...Desktop, name: 'A two-file patch, on a phone', globals: { viewport: { value: 'phone390' } } }

// Both files with their names; the lines in two columns on a wide screen and in one on a phone; the note as it is
const playAt =
  (layout: 'grid' | 'block'): StoryObj['play'] =>
  async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('src/total.ts')).toBeVisible())
    expect(canvas.getByText('README.md')).toBeVisible()
    const shown = [...canvasElement.querySelectorAll('pre')].filter((pre) => pre.checkVisibility())
    expect(shown.map((pre) => getComputedStyle(pre).display)).toEqual([layout, layout, 'block'])
    expect(within(shown[0]!).getByText('.map((line) => line.price * line.quantity)', { exact: false })).toBeVisible()
    expect(within(shown[2]!).getByText(/Reviewed with the finance team/)).toBeVisible()
  }

export const DesktopChecks: StoryObj = { ...Desktop, name: 'A two-file patch, side by side (checks)', tags: ['play', '!dev'], play: playAt('grid') }

export const PhoneChecks: StoryObj = { ...Phone, name: 'A two-file patch, on a phone (checks)', tags: ['play', '!dev', 'phone'], play: playAt('block') }
