import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession, type ResourcePermissions } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from './app'
import { fakeApi, type FakeApiInput } from './testing/fake-api'

const meta = { title: 'Record page/File fields', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

const products = resource('products')
  .table('products')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    name: f.text(),
    image: f.file().accept(['image/*']).maxSize('10 MB').optional(),
    datasheet: f.file().accept(['application/pdf']).optional(),
    frame_photo: f.file().capture().optional(),
  })
  .primaryKey((r) => r.id)

const productsView = view<typeof products>('products').icon('package').title((r) => r.name).names({ singular: 'Product', plural: 'Products' }).list((r) => ({ columns: [r.name, r.image, r.datasheet] }))

// A 1×1 PNG, as an upload's bytes and as the stored image's link
const pngBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0))
const pngUrl = `data:image/png;base64,${btoa(String.fromCharCode(...pngBytes))}`

const rows = {
  products: [
    { id: 1, name: 'City bike', image: { uri: 'private:1/a.png?name=bike.png&size=70', name: 'bike.png', type: 'image/png', size: 70, url: pngUrl }, datasheet: null },
    { id: 2, name: 'Cargo bike', image: null, datasheet: { uri: 'archive:old/cargo.pdf', missing: true } },
  ],
}

const permissions: Record<string, ResourcePermissions> = { products: { read: true, create: true, update: true, delete: false, conditional: [] } }

/** The rows the fake server holds, so a play can check what a save stored. */
let stored: Record<string, Array<Record<string, unknown>>> = {}

const Products = ({ path, upload }: { path: string; upload?: FakeApiInput['upload'] }) => {
  const [api] = useState(() => {
    const created = fakeApi({ resources: [products.toModel()], views: [productsView.toModel()], rows, permissions, ...(upload && { upload }) })
    stored = created.rows
    return created
  })
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={path} />
    </div>
  )
}

const png = () => new File([pngBytes], 'photo.png', { type: 'image/png' })

export const ReplaceAnImage: StoryObj = {
  tags: ['play'],
  render: () => <Products path="/products/1" upload={async (_resource, _field, file) => ({ value: 'ticket-1', file: { name: file.name, type: 'image/jpeg', size: file.size }, derived: {}, corrected: { from: 'image/png', to: 'image/jpeg' } })} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('link', { name: 'bike.png' })).toBeTruthy()
    await userEvent.upload(canvas.getByLabelText('Choose a file for Image'), png())
    // The type the server detected is shown, with what the browser called it
    expect(await canvas.findByText(`image/jpeg · ${pngBytes.length} bytes · sent as image/png`)).toBeTruthy()
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(stored.products![0]!.image).toMatchObject({ name: 'photo.png', type: 'image/jpeg' }))
  },
}

export const TakeAPhoto: StoryObj = {
  tags: ['play'],
  render: () => <Products path="/products/2" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // A desktop browser picks an image file; a phone opens its rear camera
    const camera = await canvas.findByLabelText<HTMLInputElement>('Choose a photo for Frame photo')
    expect(camera.getAttribute('capture')).toBe('environment')
    expect(camera.accept).toBe('image/*')
    await userEvent.upload(camera, png())
    expect(await canvas.findByText(`image/png · ${pngBytes.length} bytes`)).toBeTruthy()
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(stored.products![1]!.frame_photo).toMatchObject({ name: 'photo.png', type: 'image/png' }))
  },
}

// A phone: a coarse pointer, and an input that opens the camera for `capture`, which desktop browsers lack
const asPhone = () => {
  const matchMedia = window.matchMedia
  const hadCapture = 'capture' in HTMLInputElement.prototype
  window.matchMedia = (query) => matchMedia.call(window, query === '(pointer: coarse)' ? 'all' : query)
  if (!hadCapture) Object.defineProperty(HTMLInputElement.prototype, 'capture', { configurable: true, get: () => '' })
  return () => {
    window.matchMedia = matchMedia
    if (!hadCapture) delete (HTMLInputElement.prototype as { capture?: unknown }).capture
  }
}

export const TakeAPhotoOnAPhone: StoryObj = {
  tags: ['play'],
  beforeEach: asPhone,
  render: () => <Products path="/products/2" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The camera opens at once, and the phone's own chooser offers a photo taken before
    expect(await canvas.findByText('No photo yet')).toBeTruthy()
    expect(canvas.getByLabelText('Take a photo for Frame photo').getAttribute('capture')).toBe('environment')
    expect(canvas.getByLabelText('Choose a photo for Frame photo').hasAttribute('capture')).toBe(false)
    await userEvent.upload(canvas.getByLabelText('Take a photo for Frame photo'), png())
    expect(await canvas.findByRole('button', { name: 'Retake' })).toBeTruthy()
    expect(canvas.getAllByRole('button', { name: 'Replace' })).toHaveLength(2)
  },
}

export const RemoveAFile: StoryObj = {
  tags: ['play'],
  render: () => <Products path="/products/1" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('link', { name: 'bike.png' })
    await userEvent.click(canvas.getAllByRole('button', { name: 'Remove' })[0]!)
    expect(await canvas.findAllByText('Drop a file here or')).toHaveLength(2)
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(stored.products![0]!.image).toBeNull())
  },
}

export const RefusedType: StoryObj = {
  tags: ['play'],
  render: () => (
    <Products
      path="/products/2"
      upload={async () => {
        throw new ApiError({ type: 'urn:protobase:problem:unsupported-type', title: 'Unsupported Media Type', status: 415, detail: 'This field takes image/*; the file is application/pdf' })
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // A value naming storage the app does not have reads as missing
    expect(await canvas.findByText('The file is missing from storage')).toBeTruthy()
    await userEvent.upload(canvas.getByLabelText('Choose a file for Image'), new File(['%PDF-1.4'], 'scan.png', { type: 'image/png' }))
    expect(await canvas.findByText('This field takes image/*; the file is application/pdf')).toBeTruthy()
    expect(canvas.getByText('Not uploaded')).toBeTruthy()
  },
}

export const ListWithFiles: StoryObj = {
  tags: ['play'],
  render: () => <Products path="/products" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('bike.png')).toBeTruthy()
    expect(await canvas.findByText('File missing')).toBeTruthy()
  },
}

export const CreateWithAFile: StoryObj = {
  tags: ['play'],
  render: () => <Products path="/products/new" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvasElement.querySelector('form input:not([type])')).toBeTruthy())
    await userEvent.type(canvasElement.querySelector<HTMLInputElement>('form input:not([type])')!, 'Folding bike')
    await userEvent.upload(canvas.getByLabelText('Choose a file for Image'), png())
    expect(await canvas.findByText(`image/png · ${pngBytes.length} bytes`)).toBeTruthy()
    await userEvent.click(canvas.getByRole('button', { name: /^Create/ }))
    await waitFor(() => expect(stored.products!.find((row) => row.name === 'Folding bike')?.image).toMatchObject({ name: 'photo.png', type: 'image/png', size: pngBytes.length }))
  },
}
