import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { DiffView } from './diff-view'

const meta = {
  title: 'Components/DiffView',
  component: DiffView,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div className="w-[360px] overflow-hidden rounded-lg border border-border-strong"><Story /></div>],
} satisfies Meta<typeof DiffView>

export default meta
type Story = StoryObj<typeof meta>

const source = ` export default view<typeof invoice>('invoice')
   .list((r) => ({
-    columns: [r.number, r.customer, r.total],
+    columns: [r.number, r.customer, r.discount, r.total],
   }))`

export const WithPath: Story = {
  tags: ['play'],
  args: { source, start: 8, path: 'config/invoices/ui.ts' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    canvas.getByText('config/invoices/ui.ts')
    expect(canvas.getByText('+1')).toBeVisible()
  },
}

export const LinesOnly: Story = { args: { source: '+ALTER TABLE sales.invoices\n+  ADD COLUMN discount numeric(5,2) NOT NULL DEFAULT 0;' } }
