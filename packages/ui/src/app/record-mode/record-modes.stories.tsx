import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type ResourcePermissions } from '@protobase/client'
import type { RecordMode } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'
import { homeResources, homeRows, homeViews } from '../testing/homes-domain'

const meta = { title: 'Record page/Read view and edit', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'ada', email: 'ada@homes.example', name: 'Ada', role: 'admin' })

const allowed = (update: boolean): Record<string, ResourcePermissions> => ({
  homes: { read: true, create: update, update, delete: false, conditional: [] },
  home_photos: { read: true, create: false, update: false, delete: false, conditional: [] },
})

const Home = ({ path = '/homes/1', mode = 'read', update = true, split = false }: { path?: string; mode?: RecordMode; update?: boolean; split?: boolean }) => {
  const [client] = useState(() => fakeApi({ resources: homeResources, views: homeViews(mode, { split }), rows: homeRows(), permissions: allowed(update) }).client)
  return (
    <div className="h-screen">
      <App client={client} auth={session} initialUrl={path} />
    </div>
  )
}

const section = async (canvasElement: HTMLElement, title: string) => (await within(canvasElement).findByRole('heading', { name: title })).closest('section')!

export const ReadView: StoryObj = { name: 'Read view', render: () => <Home /> }

export const ReadViewChecks: StoryObj = {
  ...ReadView,
  name: 'Read view (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const home = await section(canvasElement, 'Home')
    // Values in a table of labels and values, not inputs
    expect(canvas.queryByRole('textbox')).toBeNull()
    const rows = [...home.querySelectorAll('dl > div')].map((row) => [row.querySelector('dt')!.textContent, row.querySelector('dd')!.textContent])
    expect(rows.map(([label]) => label)).toEqual(['Address', 'Asking price', 'Bedrooms', 'Energy label', 'Garden'])
    expect(rows[0]![1]).toBe('Keizersgracht 120')
    expect(rows[1]![1]).toMatch(/€\s?650,000/)
    // A text of several lines runs under its label and keeps its line breaks
    const about = await section(canvasElement, 'About')
    expect(about.querySelector('dd')!.textContent).toBe('A canal house on three floors.\nThe garden faces south.')

    // Help meant for editing waits for the form; help shown always stays
    expect(canvas.queryByText("Without the buyer's costs.")).toBeNull()
    expect(canvas.queryByText('As the seller states it.')).toBeNull()
    expect(canvas.getByText('Call to plan a viewing.')).toBeVisible()
    expect(canvas.getByText('The agent shows the home.')).toBeVisible()

    // Edit is a link to the form's own address, among the record's actions rather than in the header
    const edit = canvas.getByRole('link', { name: 'Edit' })
    expect(edit.getAttribute('href')).toBe('/homes/1?edit=true')
    expect(edit.closest('header')).toBeNull()
    expect(within(edit.closest('ul')!.parentElement!).getByRole('heading', { name: 'Actions' })).toBeInTheDocument()
  },
}

export const EmptyValues: StoryObj = {
  name: 'Read view of empty values (checks)',
  tags: ['play', '!dev'],
  render: () => <Home path="/homes/2" />,
  play: async ({ canvasElement }) => {
    const home = await section(canvasElement, 'Home')
    const values = [...home.querySelectorAll('dd')].map((value) => value.textContent)
    expect(values).toEqual(['Oudegracht 7', '—', '—', '—', 'No'])
    // A home without photos has no gallery, once it knows there are none
    await waitFor(() => expect(within(canvasElement).queryByRole('heading', { name: 'Photos' })).toBeNull())
  },
}

export const EditSwitch: StoryObj = {
  name: 'Edit, save and cancel (checks)',
  tags: ['play', '!dev'],
  render: () => <Home />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await section(canvasElement, 'Home')
    await userEvent.click(canvas.getAllByRole('link', { name: 'Edit' })[0]!)

    // The form, with every help line, and a way back
    const address = await canvas.findByDisplayValue('Keizersgracht 120')
    expect(canvas.getByText("Without the buyer's costs.")).toBeVisible()
    expect(canvas.getByText('As the seller states it.')).toBeVisible()
    expect(canvas.getAllByRole('link', { name: 'Cancel' })[0]!.getAttribute('href')).toBe('/homes/1')
    expect(canvas.queryByRole('link', { name: 'Edit' })).toBeNull()

    // Saving goes back to the read view with the new value
    await userEvent.clear(address)
    await userEvent.type(address, 'Keizersgracht 122')
    await userEvent.click(canvas.getAllByRole('button', { name: 'Save' })[0]!)
    await waitFor(() => expect(canvas.queryByRole('textbox')).toBeNull())
    const home = await section(canvasElement, 'Home')
    expect(home.querySelector('dd')!.textContent).toBe('Keizersgracht 122')

    // Cancel drops a change and goes back too
    await userEvent.click(canvas.getAllByRole('link', { name: 'Edit' })[0]!)
    await userEvent.type(await canvas.findByDisplayValue('Keizersgracht 122'), ' A')
    await userEvent.click(canvas.getAllByRole('link', { name: 'Cancel' })[0]!)
    await waitFor(() => expect(canvas.queryByRole('textbox')).toBeNull())
    expect((await section(canvasElement, 'Home')).querySelector('dd')!.textContent).toBe('Keizersgracht 122')
    expect(canvas.queryByText('You have unsaved changes to this record.')).toBeNull()
  },
}

export const EditAddress: StoryObj = {
  name: 'The form at its own address (checks)',
  tags: ['play', '!dev'],
  render: () => <Home path="/homes/1?edit=true" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByDisplayValue('Keizersgracht 120')).toBeVisible()
    expect(canvas.getAllByRole('link', { name: 'Cancel' })[0]).toBeVisible()
  },
}

export const Locked: StoryObj = { name: 'Locked until Edit', render: () => <Home mode="locked" /> }

export const LockedChecks: StoryObj = {
  ...Locked,
  name: 'Locked until Edit (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const home = await section(canvasElement, 'Home')
    // The form's layout, its values locked, with no table of the read view
    expect(home.querySelector('dl')).toBeNull()
    expect(within(home).getByText('Keizersgracht 120')).toBeVisible()
    expect(canvas.queryByRole('textbox')).toBeNull()
    expect(canvas.queryByText("Without the buyer's costs.")).toBeNull()
    await userEvent.click(canvas.getAllByRole('link', { name: 'Edit' })[0]!)
    expect(await canvas.findByDisplayValue('Keizersgracht 120')).toBeVisible()
    expect(canvas.getByText("Without the buyer's costs.")).toBeVisible()
  },
}

export const Reader: StoryObj = {
  name: 'A reader gets no Edit, even at the form address (checks)',
  tags: ['play', '!dev'],
  render: () => <Home path="/homes/1?edit=true" update={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const home = await section(canvasElement, 'Home')
    expect(home.querySelector('dl')).not.toBeNull()
    expect(canvas.queryByRole('textbox')).toBeNull()
    expect(canvas.queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(canvas.queryByRole('button', { name: 'Save' })).toBeNull()
  },
}

export const AlwaysEditable: StoryObj = {
  name: 'Always editable, help while editing (checks)',
  tags: ['play', '!dev'],
  render: () => <Home mode="edit" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // As before: the form at the record's address, with no Edit or Cancel, and its help shown
    expect(await canvas.findByDisplayValue('Keizersgracht 120')).toBeVisible()
    expect(canvas.queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(canvas.queryByRole('link', { name: 'Cancel' })).toBeNull()
    expect(canvas.getByText("Without the buyer's costs.")).toBeVisible()
  },
}

export const AlwaysEditableReader: StoryObj = {
  name: 'Always editable, read view to a reader (checks)',
  tags: ['play', '!dev'],
  render: () => <Home mode="edit" update={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // A user who may change nothing gets the read view, not the form, and help meant for editing stays hidden
    const home = await section(canvasElement, 'Home')
    expect(home.querySelector('dl')).not.toBeNull()
    expect(home.querySelector('dd')!.textContent).toBe('Keizersgracht 120')
    expect(canvas.queryByRole('textbox')).toBeNull()
    expect(canvas.queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(canvas.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(canvas.queryByText("Without the buyer's costs.")).toBeNull()
    expect(canvas.getByText('Call to plan a viewing.')).toBeVisible()
  },
}

export const LockedReader: StoryObj = {
  name: 'Locked until Edit, read view to a reader (checks)',
  tags: ['play', '!dev'],
  render: () => <Home mode="locked" update={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const home = await section(canvasElement, 'Home')
    expect(home.querySelector('dl')).not.toBeNull()
    expect(canvas.queryByRole('link', { name: 'Edit' })).toBeNull()
  },
}

export const FormOnly: StoryObj = {
  name: 'Sections and fields for the form or the read view only (checks)',
  tags: ['play', '!dev'],
  render: () => <Home split />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The read view has the bedrooms, without the cover or the photo list meant for the form
    const home = await section(canvasElement, 'Home')
    expect([...home.querySelectorAll('dt')].map((label) => label.textContent)).toContain('Bedrooms')
    expect(canvas.queryByRole('heading', { name: 'Cover' })).toBeNull()
    expect(canvas.queryByRole('heading', { name: 'Photo list' })).toBeNull()

    // The form swaps them: the cover and the photo list show, the bedrooms do not
    await userEvent.click(canvas.getAllByRole('link', { name: 'Edit' })[0]!)
    await canvas.findByDisplayValue('Keizersgracht 120')
    expect(await canvas.findByRole('heading', { name: 'Cover' })).toBeVisible()
    expect(await canvas.findByRole('heading', { name: 'Photo list' })).toBeVisible()
    expect(within(await section(canvasElement, 'Home')).queryByText('Bedrooms')).toBeNull()
  },
}
