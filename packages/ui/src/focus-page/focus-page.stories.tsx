import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from '../app/app'
import { fakeApi } from '../app/testing/fake-api'
// Everything the surface below draws with comes from the public entry: it is what any app or plugin has
import { Button, defineUi, FocusActions, FocusNotice, FocusPanel, FocusSlot, SearchPicker, useFocusPage, useFocusRecord, type FieldWidgetEditorProps, type PickerItem } from '../index'
import { Pin, Trash2 } from 'lucide-react'

const meta = { title: 'Record page/Focus page', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const boards = resource('boards')
  .table('boards')
  .fields({
    id: f.integer().readOnly().dbDefault(),
    name: f.text().min(1),
    pins: f.json(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)

const boardsView = view<typeof boards>('boards')
  .names({ singular: 'Board', plural: 'Boards' })
  .title((r) => r.name)
  .fields((r) => ({ pins: r.pins.widget('pin_board') }))
  .record((r) => ({ surface: r.pins }))
  .layout((r) => [l.section('Board', [r.name])])

const places: PickerItem[] = [
  { id: 'lisbon', title: 'Lisbon', description: 'Portugal', keywords: ['tram'] },
  { id: 'porto', title: 'Porto', description: 'Portugal', keywords: ['wine'] },
  { id: 'tallinn', title: 'Tallinn', description: 'Estonia', keywords: ['old town'] },
]

type Pins = string[]

// A surface a project could write, with no workflow in it: pins on a board, a picker that adds one, a panel that shows
// the one chosen, and a notice while there are none.
const PinBoard = ({ value, onChange }: FieldWidgetEditorProps<Pins>) => {
  const pins = value ?? []
  const focus = useFocusPage()
  const record = useFocusRecord()
  const [panel, setPanel] = useState<'add' | undefined>()
  const [chosen, setChosen] = useState<string>()
  return (
    <div className="flex h-full flex-wrap content-start gap-3 p-6">
      <FocusSlot zone="mode"><span className="text-body font-medium">{focus?.size === 'compact' ? pins.length : `${pins.length} pins`}</span></FocusSlot>
      <FocusSlot zone="controls"><Button onClick={() => setPanel('add')}>Add pin</Button></FocusSlot>
      <FocusActions actions={[{ name: 'Clear the board', icon: Trash2, onRun: () => onChange([]), tone: 'danger' }, { name: 'Pin all', icon: Pin, inBar: true, onRun: () => onChange(places.map((place) => place.id)) }]} />
      {record && !record.dirty && pins.length === 0 && <FocusNotice level="info">This board has no pins yet.</FocusNotice>}
      {pins.map((pin) => (
        <button key={pin} type="button" className="rounded-lg border px-4 py-3" onClick={() => setChosen(pin)}>
          {pin}
        </button>
      ))}
      {panel === 'add' && (
        <FocusPanel title="Add a pin" onClose={() => setPanel(undefined)} takesFocus>
          <SearchPicker
            autoFocus
            groups={[{ title: 'Places', items: places }]}
            onPick={(item) => {
              onChange([...pins, item.id])
              setPanel(undefined)
            }}
          />
        </FocusPanel>
      )}
      {panel === undefined && chosen && (
        <FocusPanel title={chosen} onClose={() => setChosen(undefined)}>
          <p className="text-body">This pin sits on the board.</p>
        </FocusPanel>
      )}
    </div>
  )
}

const ui = defineUi({ fields: { pin_board: { of: ['json'], display: () => null, editor: PinBoard, wide: true } } })

const Board = () => {
  const [api] = useState(() =>
    fakeApi({
      resources: [boards.toModel()],
      views: [boardsView.toModel()],
      rows: { boards: [{ id: 1, name: 'Spring trip', pins: ['lisbon'], updated_at: '2026-11-01T10:00:00.000Z' }] },
    }),
  )
  const [session] = useState(() => createStaticSession('story-token', { id: 'pip', email: 'pip@example.com', name: 'Pip', role: 'admin' }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/boards/1" ui={ui} workspace="Trips" />
    </div>
  )
}

/** A second surface on the focus page, with nothing of workflows: the framework gives it the bar, Save, panels and notices. */
export const PinBoardPage: StoryObj = { name: 'A surface of a field type of the app', render: () => <Board /> }

export const SecondSurfaceChecks: StoryObj = {
  ...PinBoardPage,
  name: 'A surface of a field type of the app (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = await canvas.findByRole('region', { name: 'Spring trip' })
    const bar = within(canvas.getByRole('group', { name: 'Page tools' }))
    // The heading is hidden, the page does not scroll, and the surface takes what the bar leaves
    expect(canvas.getByRole('heading', { name: 'Spring trip', level: 1 })).toHaveClass('sr-only')
    expect(document.scrollingElement!.scrollHeight).toBe(window.innerHeight)
    expect(page.getBoundingClientRect().bottom).toBeCloseTo(window.innerHeight, 0)
    expect(await bar.findByText('1 pins')).toBeVisible()
    // Save comes from the framework, and has nothing to do yet
    expect(bar.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true')
    // A panel takes its keyboard into the picker, and the surface narrows to make room
    const before = page.querySelector('button')!.getBoundingClientRect().left
    await userEvent.click(bar.getByRole('button', { name: 'Add pin' }))
    const panel = within(await canvas.findByRole('complementary', { name: 'Add a pin' }))
    await waitFor(() => expect(panel.getByRole('combobox', { name: 'Search' })).toHaveFocus())
    expect(page.querySelector('button')!.getBoundingClientRect().left).toBe(before)
    await userEvent.keyboard('wine')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(canvas.queryByRole('complementary', { name: 'Add a pin' })).toBeNull())
    expect(await bar.findByText('2 pins')).toBeVisible()
    // The change is a draft the framework saves
    expect(bar.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'false')
    await userEvent.click(bar.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(bar.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true'))
    // The surface's action sits in the bar by name, and the rest behind "...", with the form a link away
    expect(bar.getByRole('button', { name: 'Pin all' })).toBeVisible()
    await userEvent.click(bar.getByRole('button', { name: 'More' }))
    const menu = within(await within(document.body).findByRole('menu', { name: 'More' }))
    expect(menu.getByRole('menuitem', { name: 'Board details' })).toHaveAttribute('href', '/boards/1?standard=true')
    await userEvent.click(menu.getByRole('menuitem', { name: 'Clear the board' }))
    expect(await bar.findByText('0 pins')).toBeVisible()
  },
}
