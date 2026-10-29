import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { StatusInput } from '@protobase/schema/internal'
import { AppShell } from '../app-shell/app-shell'
import { StatusDialog } from './status-dialog'
import { AvailabilityMark, StatusMark } from './status-mark'

const meta = { title: 'Components/Status', parameters: { layout: 'padded' } } satisfies Meta
export default meta

const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString()

/** Each mark beside a name: busy, do not disturb, a custom text in full or on hover, and the online or away dot first. */
export const Marks: StoryObj = {
  tags: ['play'],
  render: () => (
      <ul className="flex w-72 flex-col gap-2">
        <li className="flex items-center gap-2">Ana <StatusMark status={{ availability: 'busy', text: null, clearsAt: null }} /></li>
        <li className="flex items-center gap-2">Bo <StatusMark status={{ availability: 'do_not_disturb', text: 'Focus time', clearsAt: inAnHour() }} /></li>
        <li className="flex items-center gap-2">Cas <StatusMark status={{ availability: 'automatic', text: 'On vacation 🌴 <b>not bold</b>', clearsAt: null }} presence="online" /></li>
        <li className="flex items-center gap-2">Dee <StatusMark status={{ availability: 'busy', text: 'Having lunch', clearsAt: null }} textShown="hover" /></li>
        <li className="flex items-center gap-2">Eli <StatusMark status={{ availability: 'busy', text: 'Gone', clearsAt: '2020-01-01T00:00:00.000Z' }} presence="away" /></li>
        <li className="flex items-center gap-2">Fay <StatusMark presence="online" /></li>
      </ul>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const [ana, bo, cas, dee, eli, fay] = canvas.getAllByRole('listitem')
    expect(within(ana!).getByRole('img', { name: 'Busy' })).toBeVisible()
    expect(within(bo!).getByRole('img', { name: 'Do not disturb' })).toBeVisible()
    expect(within(bo!).getByText('Focus time')).toBeVisible()
    // The text is shown as text, never as HTML, after the online dot.
    expect(within(cas!).getByText('On vacation 🌴 <b>not bold</b>')).toBeVisible()
    expect(cas!.querySelector('b')).toBeNull()
    expect(within(cas!).getAllByRole('img').map((mark) => mark.getAttribute('aria-label'))).toEqual(['Online'])
    // On hover only: the mark carries the text.
    expect(within(dee!).queryByText('Having lunch', { selector: 'span' })).toBeNull()
    expect(within(dee!).getByRole('img', { name: 'Busy' }).closest('[title]')).toHaveAttribute('title', 'Having lunch')
    // Past its clear time: only the away dot is left.
    expect(within(eli!).getAllByRole('img').map((mark) => mark.getAttribute('aria-label'))).toEqual(['Away'])
    expect(within(eli!).queryByText('Gone', { selector: 'span' })).toBeNull()
    // No status at all: the dot alone.
    expect(within(fay!).getByRole('img', { name: 'Online' })).toHaveAttribute('title', 'Online')
  },
}

/** "Set a status": busy, a text and a clear time an hour away; a text over 100 characters is refused before it is sent. */
export const Picker: StoryObj<{ onSave: (status: StatusInput) => Promise<void>; onClose: () => void }> = {
  tags: ['play'],
  args: { onSave: fn(async () => undefined), onClose: fn() },
  render: (args) => <StatusDialog current={null} onSave={args.onSave} onClear={async () => undefined} onClose={args.onClose} />,
  play: async ({ args }) => {
    const dialog = within(document.body)
    expect(dialog.getByRole('dialog', { name: 'Set a status' })).toBeVisible()
    expect(dialog.queryByRole('button', { name: 'Clear status' })).toBeNull()
    await userEvent.type(dialog.getByRole('textbox', { name: 'Status' }), 'x'.repeat(101))
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(await dialog.findByText('A status is at most 100 characters')).toBeVisible()
    expect(args.onSave).not.toHaveBeenCalled()

    await userEvent.clear(dialog.getByRole('textbox', { name: 'Status' }))
    await userEvent.type(dialog.getByRole('textbox', { name: 'Status' }), 'Having lunch')
    await userEvent.click(dialog.getByRole('button', { name: 'Busy' }))
    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Clear after' }), '1 hour')
    const before = Date.now()
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(args.onSave).toHaveBeenCalledWith({ availability: 'busy', text: 'Having lunch', clearsAt: expect.any(String) })
    const { clearsAt } = (args.onSave as ReturnType<typeof fn>).mock.calls[0]![0] as StatusInput
    expect(Date.parse(clearsAt!) - before).toBeGreaterThan(3_590_000)
    expect(Date.parse(clearsAt!) - before).toBeLessThan(3_610_000)
    expect(args.onClose).toHaveBeenCalled()
  },
}

/** Editing a status that clears at a date and time: the picker starts from it, and Clear status removes it. */
export const EditPicker: StoryObj<{ onClear: () => Promise<void> }> = {
  tags: ['play'],
  args: { onClear: fn(async () => undefined) },
  render: (args) => <StatusDialog current={{ availability: 'do_not_disturb', text: 'Focus', clearsAt: inAnHour() }} onSave={async () => undefined} onClear={args.onClear} onClose={() => {}} />,
  play: async ({ args }) => {
    const dialog = within(document.body)
    expect(dialog.getByRole('dialog', { name: 'Edit status' })).toBeVisible()
    expect(dialog.getByRole('textbox', { name: 'Status' })).toHaveValue('Focus')
    expect(dialog.getByRole('button', { name: 'Do not disturb' })).toHaveAttribute('aria-pressed', 'true')
    expect(dialog.getByText('You get no push notifications; they wait in the bell.')).toBeVisible()
    expect(dialog.getByLabelText('Clears at')).not.toHaveValue('')
    await userEvent.click(dialog.getByRole('button', { name: 'Clear status' }))
    expect(args.onClear).toHaveBeenCalled()
  },
}

/** The user menu with a status: its mark by the name, and the item that edits it showing the status itself. */
export const InUserMenu: StoryObj<{ onOpen: () => void }> = {
  tags: ['play'],
  args: { onOpen: fn() },
  parameters: { layout: 'fullscreen' },
  render: (args) => (
    <div className="h-screen">
      <AppShell
        sidebarMode="text-small"
        activeItem=""
        breadcrumb={['Home']}
        user={{ name: 'Sample User', email: 'sample@example.test', initials: 'SU', hue: 250, role: 'Admin', roleTone: 'violet' }}
        profileMenuOpen
        status={{ mark: <StatusMark status={{ availability: 'do_not_disturb', text: 'Focus', clearsAt: null }} textShown="hover" />, label: <span className="flex items-center gap-1.5"><AvailabilityMark availability="do_not_disturb" />Focus</span>, onOpen: args.onOpen }}
      >
        <div className="p-6 text-muted-foreground">Page content</div>
      </AppShell>
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const menu = canvas.getByRole('menu')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Do not disturb Focus' }))
    expect(args.onOpen).toHaveBeenCalled()
    expect(within(canvas.getByRole('button', { name: 'Profile menu' })).getByRole('img', { name: 'Do not disturb' })).toBeVisible()
  },
}
