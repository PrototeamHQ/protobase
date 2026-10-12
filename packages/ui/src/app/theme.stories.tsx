import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { customers, repairs } from '../../../../docs-examples/bike-shop/data'
import { customerRows, repairRows } from '../../../../docs-examples/bike-shop/rows'
import { customersView, repairsView } from '../../../../docs-examples/bike-shop/step-5'
import { App } from './app'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Theme/A project theme', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

// A protobase.theme.css as `protobase build` writes it: token values only, for light and dark. It comes before the
// app's stylesheet here, and still wins, since the app's defaults sit in a layer.
const theme = ':root{--primary:#0d9488;--primary-hover:#0f766e;--primary-soft:#f0fdfa;--primary-text:#0f766e;--radius:12px;--font:Georgia, serif}[data-theme=dark]{--primary:#2dd4bf}'

const Themed = () => {
  const [api] = useState(() => fakeApi({ resources: [customers.toModel(), repairs.toModel()], views: [customersView.toModel(), repairsView.toModel()], rows: { customers: customerRows, repairs: repairRows } }))
  const [session] = useState(() => createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' }))
  return (
    <div className="h-screen">
      <style>{theme}</style>
      <App client={api.client} auth={session} initialUrl="/repairs" workspace="Pip's bike shop" />
    </div>
  )
}

export const Light: StoryObj = { name: 'Teal, rounder, serif', render: () => <Themed /> }

export const LightChecks: StoryObj = {
  ...Light,
  name: 'Teal, rounder, serif (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = await canvas.findByRole('button', { name: 'New repair' })
    const style = getComputedStyle(button)
    expect(style.backgroundColor).toBe('rgb(13, 148, 136)')
    // rounded-md is --radius, rounded-lg two pixels more
    expect(style.borderTopLeftRadius).toBe('12px')
    expect(getComputedStyle(document.body).fontFamily).toBe('Georgia, serif')
  },
}
