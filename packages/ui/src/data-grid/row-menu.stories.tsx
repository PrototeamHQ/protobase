import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { orderAt } from '../mocks'
import type { GridRow } from './column-spec'
import { DataGrid } from './data-grid'
import { ordersColumns, ordersNaturalSort } from './orders-columns'
import type { RowAction } from './row-menu'
import { createRowSource } from './row-source'

// Five orders; every other one is locked, so actions that skip locked rows leave those rows without a menu.
const orders = createRowSource(5, (index) => ({ ...orderAt(index), locked: index % 2 === 1 }))
const unlocked = (row: GridRow) => !row.locked

const open: RowAction = { label: 'Open order', onSelect: () => undefined }
const remove: RowAction = { label: 'Delete', destructive: true, available: unlocked, onSelect: () => undefined }
const archive: RowAction = { label: 'Archive', available: () => false, onSelect: () => undefined }

const meta = {
  title: 'Components/DataGrid/Row menu',
  component: DataGrid,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="flex h-screen flex-col p-4"><Story /></div>],
  args: { columns: ordersColumns, source: orders, naturalSort: ordersNaturalSort, latencyMs: 0, rowActions: [open, remove] },
} satisfies Meta<typeof DataGrid>

export default meta
type Story = StoryObj<typeof meta>

const dataRows = async (canvasElement: HTMLElement) => {
  const grid = within(canvasElement).getByRole('grid')
  await waitFor(() => expect(within(grid).getAllByRole('row').filter((row) => !row.hasAttribute('aria-busy')).length).toBe(6))
  return within(grid).getAllByRole('row').slice(1)
}

/** The menu is drawn above the rows below it: the point under its first item belongs to the menu. */
const expectMenuOnTop = async (canvasElement: HTMLElement, items: string[]) => {
  const menu = await within(canvasElement.ownerDocument.body).findByRole('menu')
  await waitFor(() => expect(menu.style.visibility).not.toBe('hidden'))
  expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(items)
  const box = within(menu).getAllByRole('menuitem')[0]!.getBoundingClientRect()
  expect(menu.contains(document.elementFromPoint(box.left + 8, box.top + box.height / 2))).toBe(true)
}

export const EveryRowHasActions: Story = {
  tags: ['play'],
  args: { rowActions: [open] },
  play: async ({ canvasElement }) => {
    const rows = await dataRows(canvasElement)
    expect(rows.map((row) => within(row).queryByRole('button', { name: 'Row actions' }) !== null)).toEqual([true, true, true, true, true])
    await userEvent.click(within(rows[0]!).getByRole('button', { name: 'Row actions' }))
    await expectMenuOnTop(canvasElement, ['Open order'])
  },
}

export const NoRowHasActions: Story = {
  tags: ['play'],
  args: { rowActions: [archive] },
  play: async ({ canvasElement }) => {
    const rows = await dataRows(canvasElement)
    expect(within(canvasElement).queryAllByRole('button', { name: 'Row actions' })).toHaveLength(0)
    // The menu column stays, so the grid is laid out as it is with menus
    expect(rows[0]!.style.gridTemplateColumns).toMatch(/ 40px$/)
  },
}

export const SomeRowsHaveActions: Story = {
  tags: ['play'],
  args: { rowActions: [remove, archive] },
  play: async ({ canvasElement }) => {
    const rows = await dataRows(canvasElement)
    expect(rows.map((row) => within(row).queryByRole('button', { name: 'Row actions' }) !== null)).toEqual([true, false, true, false, true])
    expect(new Set(rows.map((row) => row.style.gridTemplateColumns)).size).toBe(1)
    await userEvent.click(within(rows[2]!).getByRole('button', { name: 'Row actions' }))
    await expectMenuOnTop(canvasElement, ['Delete'])
  },
}

export const LastRowMenu: Story = {
  tags: ['play'],
  play: async ({ canvasElement }) => {
    const rows = await dataRows(canvasElement)
    await userEvent.click(within(rows[4]!).getByRole('button', { name: 'Row actions' }))
    await expectMenuOnTop(canvasElement, ['Open order', 'Delete'])
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(within(canvasElement.ownerDocument.body).queryByRole('menu')).toBeNull())
  },
}
