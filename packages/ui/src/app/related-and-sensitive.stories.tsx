import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession, type AuthSession, type ResourcePermissions } from '@protobase/client'
import { App } from './app'
import { fakeApi, type FakeApiInput } from './testing/fake-api'
import { forbidden } from './testing/fake-client'
import { rentalIbans, rentalResources, rentalRows, rentalViews } from './testing/rentals-domain'

const meta = { title: 'Record page/Related records and sensitive fields', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'manager' })

const permissions = (update: boolean): Record<string, ResourcePermissions> =>
  Object.fromEntries(rentalResources.map((model) => [model.name, { read: true, create: update, update, delete: false, conditional: [] }]))

/** Every reveal the fake server answered, so a play can count them. */
const reveals: string[] = []

const Rentals = ({ path, update = true, reveal, auth = session }: { path: string; update?: boolean; reveal?: FakeApiInput['reveal']; auth?: AuthSession }) => {
  const [api] = useState(() =>
    fakeApi({
      resources: rentalResources,
      views: rentalViews,
      rows: rentalRows,
      permissions: permissions(update),
      reveal: reveal ?? (async (resource, key, field, value) => (reveals.push(`${resource}/${key}/${field}`), value)),
    }),
  )
  return (
    <div className="h-screen">
      <App client={api.client} auth={auth} initialUrl={path} />
    </div>
  )
}

const sectionRows = async (canvasElement: HTMLElement, section: string) => {
  const heading = await within(canvasElement).findByRole('heading', { name: section })
  const region = heading.closest('section')!
  await within(region).findAllByRole('row')
  return within(region).getAllByRole('row').slice(1)
}

const rowTexts = async (canvasElement: HTMLElement, section: string) => (await sectionRows(canvasElement, section)).map((row) => row.textContent ?? '')

export const TenantHomes: StoryObj = {
  tags: ['play'],
  render: () => <Rentals path="/tenants/1" />,
  play: async ({ canvasElement }) => {
    await waitFor(async () => expect(await rowTexts(canvasElement, 'Homes')).toHaveLength(2))
    const [current, past] = await rowTexts(canvasElement, 'Homes')
    // The running lease, without an end date, comes first; the property is followed through the unit
    expect(current).toContain('L-2023-017')
    await waitFor(async () => expect((await rowTexts(canvasElement, 'Homes'))[0]).toContain('Keizersgracht 120 2.01'))
    expect(past).toContain('L-2019-004')
    await waitFor(async () => expect((await rowTexts(canvasElement, 'Homes'))[1]).toContain('Oudegracht 7'))
  },
}

export const IbanRevealedOnRequest: StoryObj = {
  tags: ['play'],
  render: () => <Rentals path="/tenants/1" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    reveals.length = 0
    const input = (await canvas.findByLabelText('IBAN')) as HTMLInputElement
    expect(input.type).toBe('password')
    expect(input.value).toBe('')
    expect(canvasElement.textContent).not.toContain(rentalIbans.ada)
    await userEvent.click(canvas.getByRole('button', { name: 'Show IBAN' }))
    await waitFor(() => expect(input.value).toBe(rentalIbans.ada))
    expect(input.type).toBe('text')
    expect(reveals).toEqual(['tenants/1/iban'])
    await userEvent.click(canvas.getByRole('button', { name: 'Hide IBAN' }))
    expect(input.type).toBe('password')
    expect(input.value).toBe('')
    // Showing it again uses the value already fetched: one reveal per visit
    await userEvent.click(canvas.getByRole('button', { name: 'Show IBAN' }))
    await waitFor(() => expect(input.value).toBe(rentalIbans.ada))
    expect(reveals).toHaveLength(1)
  },
}

export const IbanReadOnly: StoryObj = {
  tags: ['play'],
  render: () => <Rentals path="/tenants/2" update={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    reveals.length = 0
    await canvas.findByText('••••••••••')
    expect(canvas.queryByLabelText('IBAN')).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Show IBAN' }))
    expect(await canvas.findByText(rentalIbans.bram)).toBeVisible()
    expect(reveals).toEqual(['tenants/2/iban'])
  },
}

export const IbanRevealRefused: StoryObj = {
  tags: ['play'],
  render: () => (
    <Rentals
      path="/tenants/1"
      reveal={async () => {
        throw forbidden('You may not see bank details.')
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Show IBAN' }))
    expect(await canvas.findByText('Could not show the IBAN')).toBeVisible()
    expect(canvas.getByText('You may not see bank details.')).toBeVisible()
    expect(canvasElement.textContent).not.toContain(rentalIbans.ada)
  },
}

// An account with a passkey and an authenticator app, whose code confirms it's them until the page reloads.
let confirmed = false
const strongSession: AuthSession = {
  ...session,
  verifyTwoFactor: async (input) => {
    confirmed = input.code === '123456'
    if (!confirmed) throw new Error('The code did not work')
    return session.verifyTwoFactor(input)
  },
  account: {
    ...session.account,
    signInMethods: async () => ({ ...(await session.account.signInMethods()), account: { password: true, passkeys: 1, twoFactor: true, authenticatorApp: true } }),
  },
}

export const IbanAfterConfirmingItsYou: StoryObj = {
  tags: ['play'],
  render: () => (
    <Rentals
      path="/tenants/1"
      auth={strongSession}
      reveal={async (_resource, _key, _field, value) => {
        if (confirmed) return value
        throw new ApiError({ type: 'urn:protobase:problem:strong-sign-in-required', title: 'Forbidden', status: 403, detail: "Confirm it's you", minutes: 15 })
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    confirmed = false
    const canvas = within(canvasElement)
    const input = (await canvas.findByLabelText('IBAN')) as HTMLInputElement
    await userEvent.click(canvas.getByRole('button', { name: 'Show IBAN' }))
    const step = await canvas.findByRole('region', { name: "Confirm it's you" })
    expect(within(step).getByText('Showing this needs a passkey or your authenticator app in the last 15 minutes.')).toBeVisible()
    expect(await within(step).findByRole('button', { name: 'Use a passkey' })).toBeVisible()
    expect(canvasElement.textContent).not.toContain(rentalIbans.ada)
    await userEvent.type(within(step).getByLabelText('Code from your authenticator app'), '123456')
    await waitFor(() => expect(input.value).toBe(rentalIbans.ada))
    expect(input.type).toBe('text')
    expect(canvas.queryByRole('region', { name: "Confirm it's you" })).toBeNull()
  },
}

export const UnitLetTo: StoryObj = {
  tags: ['play'],
  render: () => <Rentals path="/units/1" />,
  play: async ({ canvasElement }) => {
    await waitFor(async () => expect(await rowTexts(canvasElement, 'Let to')).toHaveLength(2))
    await waitFor(async () => {
      const [primary, coSigner] = await rowTexts(canvasElement, 'Let to')
      expect(primary).toContain('Ada de Vries')
      expect(primary).toContain('ada@example.test')
      expect(coSigner).toContain('Bram Jansen')
      expect(coSigner).toContain('Co-signer')
    })
    expect((await rowTexts(canvasElement, 'Running lease'))[0]).toContain('L-2023-017')
  },
}

const ada = rentalRows.tenants.find((tenant) => tenant.name === 'Ada de Vries')!

/** A "Let to" row is a link between the lease and a tenant: it opens the tenant, and its menu edits the link itself. */
export const UnitLetToOpensTenant: StoryObj = {
  tags: ['play'],
  render: () => <Rentals path="/units/1" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(async () => expect((await rowTexts(canvasElement, 'Let to'))[0]).toContain('Ada de Vries'))
    const [primary] = await sectionRows(canvasElement, 'Let to')
    expect(within(primary!).getAllByRole('link')[0]!.getAttribute('href')).toMatch(new RegExp(`/tenants/${ada.id}$`))
    await userEvent.click(within(primary!).getByRole('button', { name: 'Row actions' }))
    const menu = await within(canvasElement.ownerDocument.body).findByRole('menu')
    const items = within(menu).getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual(['Open tenant', 'Edit lease tenant'])
    expect(items[0]!.getAttribute('href')).toMatch(new RegExp(`/tenants/${ada.id}$`))
    expect(items[1]!.getAttribute('href')).toMatch(/\/lease_tenants\/[^?]+\?edit=true$/)
    await userEvent.keyboard('{Escape}')
    await userEvent.click(within(primary!).getByText('Primary'))
    expect(await canvas.findByRole('heading', { name: 'Homes' })).toBeVisible()
  },
}

/** A tenant's homes are the leases themselves, so a row opens its lease. */
export const TenantHomesOpenLeases: StoryObj = {
  tags: ['play'],
  render: () => <Rentals path={`/tenants/${ada.id}`} />,
  play: async ({ canvasElement }) => {
    await waitFor(async () => expect(await rowTexts(canvasElement, 'Homes')).toHaveLength(2))
    const [current] = await sectionRows(canvasElement, 'Homes')
    expect(within(current!).getAllByRole('link')[0]!.getAttribute('href')).toMatch(/\/leases\/\d+$/)
  },
}

export const VacantUnit: StoryObj = {
  tags: ['play'],
  render: () => <Rentals path="/units/2" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getAllByText('Vacant: no lease runs today.')).toHaveLength(2))
  },
}
