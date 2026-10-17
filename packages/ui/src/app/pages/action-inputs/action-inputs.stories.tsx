import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import type { ActionInputModel, ViewModel } from '@protobase/schema'
import { Segmented } from '../../../primitives/segmented'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'
import { salesResources, salesRows, salesViews } from '../guide/sales-domain'
import { defineUi, type ActionContext } from '../project-ui'
import type { ActionInputProps } from './action-inputs-dialog'
import { ActionInputError } from './input-errors'

const session = createStaticSession('story-token', { id: 'story', email: 'sam@veldhuis.example', name: 'Sam Veldhuis', role: 'admin' })

const inputs: ActionInputModel[] = [
  { name: 'due_on', kind: 'date', label: 'Due date', required: true, help: 'As YYYY-MM-DD.' },
  { name: 'bill_to', kind: 'choice', label: 'Bill to', required: false, resource: 'companies' },
  { name: 'delivery', kind: 'choice', label: 'Send by', required: true, default: 'email', options: [{ value: 'email', label: 'Email' }, { value: 'post', label: 'Post' }] },
  { name: 'address', kind: 'text', label: 'Postal address', required: true, multiline: true, when: "delivery = 'post'" },
  { name: 'priority', kind: 'custom', label: 'Priority', required: false, default: 'normal', component: 'PriorityInput', props: { levels: ['low', 'normal', 'high'] } },
  { name: 'reminders', kind: 'boolean', label: 'Send reminders', required: false, default: true },
]

const views: ViewModel[] = salesViews.map((view) =>
  view.resource === 'orders' ? { ...view, actions: [...view.actions, { name: 'createInvoice', label: 'Create invoice', icon: 'file-text', bulk: false, inputs }] } : view,
)

/** A custom input: what a project component edits, shaped like a field type's editor. */
const PriorityInput = ({ value, onChange, props }: ActionInputProps<string, { levels: string[] }>) => (
  <Segmented label="Priority" value={value ?? 'normal'} onChange={onChange} options={props.levels.map((level) => ({ value: level, label: level === 'low' ? 'Low' : level === 'high' ? 'High' : 'Normal' }))} />
)

const ActionInputsApp = () => {
  const [api] = useState(() => fakeApi({ resources: salesResources, views, rows: salesRows }))
  const [sent, setSent] = useState<Record<string, unknown>>()
  const [ui] = useState(() =>
    defineUi({
      components: { PriorityInput },
      actions: {
        createInvoice: ({ values }: ActionContext) => {
          if (values?.due_on === '2020-01-01') throw new ActionInputError({ due_on: 'The due date has passed' })
          setSent(values)
        },
      },
    }),
  )
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/orders/1" workspace="Veldhuis Supply" ui={ui} />
      {sent && <output aria-label="Handler values" className="sr-only">{JSON.stringify(sent)}</output>}
    </div>
  )
}

const meta = { title: 'Record page/Action inputs', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

export const Dialog: StoryObj = {
  render: () => <ActionInputsApp />,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Create invoice' }))
  },
}

export const Checks: StoryObj = {
  render: () => <ActionInputsApp />,
  name: 'Dialog (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Create invoice' }))
    const dialog = within(await canvas.findByRole('dialog', { name: 'Create invoice' }))
    // An input shows only while its `when` holds
    expect(dialog.queryByText('Postal address')).toBeNull()
    // "Send by" is the one combobox that is a select; "Bill to" is a relation picker
    const sendBy = dialog.getAllByRole('combobox').find((box) => box.tagName === 'SELECT')!
    await userEvent.selectOptions(sendBy, 'post')
    expect(await dialog.findByText('Postal address')).toBeVisible()

    // Required answers are asked for before the handler runs
    await userEvent.click(dialog.getByRole('button', { name: 'Create invoice' }))
    await waitFor(() => expect(dialog.getAllByText('Required')).toHaveLength(2))

    // The handler's refusal shows under the input it is about, and the dialog stays open
    const [dueOn, address] = dialog.getAllByRole('textbox')
    await userEvent.type(dueOn!, '2020-01-01')
    await userEvent.type(address!, 'Stationsplein 1, Utrecht')
    await userEvent.click(dialog.getByRole('button', { name: 'Create invoice' }))
    expect(await dialog.findByText('The due date has passed')).toBeVisible()

    // A hidden input is left out of the values; a custom input's answer is in them
    await userEvent.selectOptions(sendBy, 'email')
    await userEvent.clear(dueOn!)
    await userEvent.type(dueOn!, '2026-11-01')
    await userEvent.click(dialog.getByRole('button', { name: 'High' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Create invoice' }))
    await waitFor(() => expect(canvas.queryByRole('dialog', { name: 'Create invoice' })).toBeNull())
    const values = JSON.parse((await canvas.findByLabelText('Handler values')).textContent ?? '{}')
    expect(values).toEqual({ due_on: '2026-11-01', bill_to: null, delivery: 'email', priority: 'high', reminders: true })
  },
}
