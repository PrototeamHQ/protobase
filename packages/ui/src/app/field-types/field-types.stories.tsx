import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { customers, repairs } from '../../../../../docs-examples/bike-shop/data'
import { customerRows, repairRows } from '../../../../../docs-examples/bike-shop/rows'
import { customersView } from '../../../../../docs-examples/bike-shop/step-5'
import * as workshop from '../../../../../docs-examples/reference/workshop'
import { App } from '../app'
import { defineUi } from '../pages/project-ui'
import { fakeApi } from '../testing/fake-api'
import { RepairBoard } from '../testing/repair-board'
import { Broken, StepsDisplay, StepsEditor } from '../testing/repair-steps'

const meta = { title: 'Plugins/Field types', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

// `steps` shows enums; `broken` throws. The view shows the status with steps, the estimate with broken, and the bike
// with steps too, which does not show text.
const ui = defineUi({
  components: { RepairBoard },
  fields: { steps: { of: ['enum'], display: StepsDisplay, editor: StepsEditor }, broken: { of: ['decimal'], display: Broken } },
})
const repairsView = workshop.repairsView
  .fields((r) => ({ status: r.status.widget('steps'), estimate: r.estimate.prefix('€').currency('EUR').widget('broken'), bike: r.bike.widget('steps') }))
  .list((r) => ({ columns: [r.number, r.bike, r.status, r.estimate] }))

const Shop = ({ start }: { start: string }) => {
  const [api] = useState(() => fakeApi({ resources: [customers.toModel(), repairs.toModel()], views: [customersView.toModel(), repairsView.toModel()], rows: { customers: customerRows, repairs: repairRows } }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={start} ui={ui} workspace="Pip's bike shop" />
    </div>
  )
}

export const InTheTable: StoryObj = { name: 'In the table', render: () => <Shop start="/repairs" /> }

export const OnTheRecordPage: StoryObj = { name: 'On the record page', render: () => <Shop start="/repairs/5" /> }

export const InTheTableChecks: StoryObj = {
  ...InTheTable,
  name: 'In the table (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The status draws its field type; the estimate's throws, and the bike is text: both draw as they would without
    expect(await canvas.findAllByLabelText('Step 4 of 5: ready')).toHaveLength(2)
    expect(canvas.getAllByText('Brompton C Line').length).toBeGreaterThan(0)
    expect(canvas.getAllByText('€42.00')[0]).toBeVisible()
  },
}

export const OnTheRecordPageChecks: StoryObj = {
  ...OnTheRecordPage,
  name: 'On the record page (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'R-305' })
    // The form edits the status with the field type's editor; the summary shows it with its display
    const status = canvas.getByRole('radiogroup', { name: 'status' })
    expect(within(status).getByRole('radio', { name: 'ready' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(within(status).getByRole('radio', { name: 'collected' }))
    expect(within(status).getByRole('radio', { name: 'collected' })).toHaveAttribute('aria-checked', 'true')
    expect(canvas.getAllByText('Unsaved changes')[0]).toBeVisible()
    expect(canvas.getAllByLabelText('Step 4 of 5: ready')[0]).toBeVisible()
    // The bike, text, keeps its input
    expect(canvas.getByDisplayValue('Brompton C Line')).toBeVisible()
  },
}
