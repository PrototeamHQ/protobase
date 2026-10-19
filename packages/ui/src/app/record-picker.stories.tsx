import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { f, resource, view } from '@protobase/schema'
import { ApiProvider } from '../data/api-provider'
import { MetaContext } from '../data/meta-context'
import type { MetaData } from '../data/meta-data'
import { Field } from '../record-view/field'
import { RecordPicker } from './record-picker'
import { fakeApi } from './testing/fake-api'

const objectives = resource('objectives')
  .table('objectives')
  .fields({ id: f.integer().filterable().sortable(), title: f.text().filterable() })
  .primaryKey((r) => r.id)

const objectivesView = view<typeof objectives>('objectives').names({ singular: 'Objective', plural: 'Objectives' })

const rows = {
  objectives: [
    { id: 1, title: 'Faster checkout' },
    { id: 2, title: 'Fewer support tickets' },
    { id: 3, title: 'Mobile first' },
  ],
}

const appMeta: MetaData = {
  etag: '"1"',
  appName: 'Stories',
  resources: { objectives: objectives.toModel() },
  views: { objectives: objectivesView.toModel() },
  pages: {},
  permissions: {},
}

// The app's own component: it names the resource, and keeps the keys it is given.
const Harness = ({ initial }: { initial: string[] }) => {
  const [client] = useState(() => fakeApi({ resources: [objectives.toModel()], views: [objectivesView.toModel()], rows: structuredClone(rows) }).client)
  const [one, setOne] = useState<string | undefined>(initial[0])
  const [several, setSeveral] = useState(initial)
  return (
    <MetaContext.Provider value={appMeta}>
      <ApiProvider client={client}>
        <div className="flex w-80 flex-col gap-5 p-6">
          <Field label="Main objective">
            <RecordPicker resource="objectives" value={one} onChange={setOne} />
          </Field>
          <Field label="Objectives">
            <RecordPicker resource="objectives" multiple value={several} onChange={setSeveral} />
          </Field>
          <p className="mt-40">Chosen: {several.join(', ') || 'none'}</p>
        </div>
      </ApiProvider>
    </MetaContext.Provider>
  )
}

const meta = { title: 'Form parts/Record picker', tags: ['play'] } satisfies Meta
export default meta

const pickers = (canvasElement: HTMLElement) => within(canvasElement).getAllByRole('combobox')

/** Keys given by the component show as the names of their records. */
export const NamesGivenKeys: StoryObj = {
  render: () => <Harness initial={['2', '3']} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(pickers(canvasElement)[0]).toHaveValue('Fewer support tickets'))
    await expect(canvas.getByRole('button', { name: 'Remove Fewer support tickets' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Remove Mobile first' })).toBeVisible()
  },
}

/** With `multiple`, each choice adds a token while the list stays open, choosing a chosen one or its button takes it off. */
export const PicksSeveral: StoryObj = {
  render: () => <Harness initial={[]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = pickers(canvasElement)[1]!
    await expect(box).toHaveAttribute('placeholder', 'Search objectives')
    await userEvent.type(box, 'tickets')
    await waitFor(() => expect(canvas.getAllByRole('option').map((option) => option.textContent)).toEqual(['Fewer support tickets']))
    await userEvent.keyboard('{Enter}')
    await expect(box).toHaveValue('')
    await waitFor(() => expect(canvas.getAllByRole('option')).toHaveLength(3))
    await userEvent.click(canvas.getByRole('option', { name: 'Faster checkout' }))
    await expect(canvas.getByText('Chosen: 2, 1')).toBeVisible()
    await userEvent.click(canvas.getByRole('option', { name: 'Fewer support tickets' }))
    await expect(canvas.getByText('Chosen: 1')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Remove Faster checkout' }))
    await expect(canvas.getByText('Chosen: none')).toBeVisible()
  },
}
