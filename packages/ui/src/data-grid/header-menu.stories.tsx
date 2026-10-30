import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { orderAt } from '../mocks'
import { DataGrid } from './data-grid'
import { ordersColumns, ordersNaturalSort } from './orders-fixtures'
import { createRowSource } from './row-source'

const meta = {
  title: 'Components/DataGrid/Header menu',
  component: DataGrid,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="flex h-screen flex-col p-4"><Story /></div>],
  args: { columns: ordersColumns, source: createRowSource(5, orderAt), naturalSort: ordersNaturalSort, latencyMs: 0 },
} satisfies Meta<typeof DataGrid>

export default meta
type Story = StoryObj<typeof meta>

/** The menu is drawn above the rows under the header: the point under each item belongs to the menu. */
const openMenuOnTop = async (canvasElement: HTMLElement, header: string, items: string[]) => {
  const grid = within(canvasElement).getByRole('grid')
  await waitFor(() => expect(within(grid).getAllByRole('row').filter((row) => !row.hasAttribute('aria-busy')).length).toBe(6))
  await userEvent.click(within(grid).getByRole('button', { name: `${header} column menu` }))
  const menu = await within(canvasElement.ownerDocument.body).findByRole('menu')
  await waitFor(() => expect(menu.style.visibility).not.toBe('hidden'))
  const menuItems = within(menu).getAllByRole('menuitem')
  expect(menuItems.map((item) => item.textContent)).toEqual(items)
  for (const item of menuItems) {
    const box = item.getBoundingClientRect()
    expect(menu.contains(document.elementFromPoint(box.left + 8, box.top + box.height / 2))).toBe(true)
  }
  return menu
}

export const OverTheRows: Story = {
  tags: ['play'],
  play: async ({ canvasElement }) => {
    const menu = await openMenuOnTop(canvasElement, 'Paid', ["This column can't be sorted", 'Pin to left'])
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Pin to left' }))
    await waitFor(() => expect(within(canvasElement.ownerDocument.body).queryByRole('menu')).toBeNull())
    await openMenuOnTop(canvasElement, 'Paid', ["This column can't be sorted", 'Unpin'])
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(within(canvasElement.ownerDocument.body).queryByRole('menu')).toBeNull())
  },
}

export const OverTheRowsOnPhone: Story = {
  tags: ['play', 'phone'],
  play: async ({ canvasElement }) => {
    await openMenuOnTop(canvasElement, 'Order', ['Pin to left'])
  },
}
