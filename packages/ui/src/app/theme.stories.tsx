import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { customers, repairs } from '../../../../docs-examples/bike-shop/data'
import { customerRows, repairRows } from '../../../../docs-examples/bike-shop/rows'
import { customersView, repairsView } from '../../../../docs-examples/bike-shop/step-5'
import { themeStorageKey } from '../theme/theme-preference'
import { App } from './app'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Theme/A project theme', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

// A protobase.theme.css as `protobase build` writes it: token values only, for light and dark. It comes before the
// app's stylesheet here, and still wins, since the app's defaults sit in a layer.
const theme =
  ':root{--primary:#0d9488;--primary-hover:#0f766e;--primary-soft:#f0fdfa;--primary-text:#0f766e;--radius:12px;--font:Georgia, serif}' +
  '[data-theme=dark]{--primary:#2dd4bf;--primary-hover:#5eead4;--primary-foreground:#042f2e;--primary-soft:#11302c;--primary-text:#5eead4}'

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
    const button = await canvas.findByRole('link', { name: 'New repair' })
    const style = getComputedStyle(button)
    expect(style.backgroundColor).toBe('rgb(13, 148, 136)')
    // rounded-md is --radius, rounded-lg two pixels more
    expect(style.borderTopLeftRadius).toBe('12px')
    expect(getComputedStyle(document.body).fontFamily).toBe('Georgia, serif')
  },
}

export const Dark: StoryObj = { name: 'Teal, rounder, serif, in dark', globals: { theme: 'dark' }, render: () => <Themed /> }

// The theme's dark values win over the app's dark ones, and the light values it gives no dark one for hold in dark too.
export const DarkChecks: StoryObj = {
  ...Dark,
  name: 'Teal, rounder, serif, in dark (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = await canvas.findByRole('link', { name: 'New repair' })
    const style = getComputedStyle(button)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(style.backgroundColor).toBe('rgb(45, 212, 191)')
    expect(style.color).toBe('rgb(4, 47, 46)')
    expect(style.borderTopLeftRadius).toBe('12px')
    expect(getComputedStyle(document.body).backgroundColor).toBe('rgb(15, 15, 17)')
  },
}

// The profile menu's switch draws the page in the theme picked, remembers it, and follows the system again on "System".
export const Switching: StoryObj = {
  name: 'Switching theme (checks)',
  tags: ['play', '!dev'],
  render: () => <Themed />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Profile menu' }))
    const group = within(canvas.getByRole('group', { name: 'Theme' }))
    expect(group.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(group.getByRole('button', { name: 'Dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(themeStorageKey)).toBe('dark')
    expect(group.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true')
    expect(getComputedStyle(document.body).backgroundColor).toBe('rgb(15, 15, 17)')

    await userEvent.click(group.getByRole('button', { name: 'System' }))
    expect(localStorage.getItem(themeStorageKey)).toBeNull()
    expect(document.documentElement.dataset.theme).toBe(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

    await userEvent.click(group.getByRole('button', { name: 'Light' }))
    expect(document.documentElement.dataset.theme).toBe('light')
  },
}
