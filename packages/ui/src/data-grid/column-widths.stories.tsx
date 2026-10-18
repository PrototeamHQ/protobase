import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import type { ColumnSpec, GridRow } from './column-spec'
import { headerWidth } from './content-widths'
import { DataGrid } from './data-grid'
import { createRowSource } from './row-source'

const names = ['Nordlicht Systemtechnik und Industrieautomation GmbH', 'Acme', 'Brightwater Logistics and Freight Forwarding Ltd', 'Kestrel Analytics']

const companyAt = (index: number): GridRow => ({
  id: String(index + 1),
  name: names[index % names.length]!,
  city: index % 2 === 0 ? 'Bonn' : 'Köln',
  status: index % 3 === 0 ? 'lead' : 'active',
  vip: index % 2 === 0,
  revenue: 123_456_789 + index,
})

// As a list gets them from its view: static widths, and room for each header
const columns: ColumnSpec[] = [
  { id: 'name', header: 'Name', kind: 'text', width: 200, title: true },
  { id: 'city', header: 'City', kind: 'text', width: 200 },
  { id: 'status', header: 'Status', kind: 'status', width: 150, labels: { lead: 'Lead', active: 'Active' } },
  { id: 'vip', header: 'VIP', kind: 'boolean', width: 64, fixed: true },
  { id: 'revenue', header: 'Revenue', kind: 'money', width: 120, currency: 'EUR' },
].map((spec) => ({ ...spec, minWidth: headerWidth(spec.header, false) }) as ColumnSpec)

const meta = {
  title: 'Components/DataGrid/Column widths',
  component: DataGrid,
  parameters: { layout: 'fullscreen' },
  args: { columns, source: createRowSource(40, companyAt), latencyMs: 0 },
} satisfies Meta<typeof DataGrid>

export default meta
type Story = StoryObj<typeof meta>

const headerCell = (grid: HTMLElement, id: string) => grid.querySelector<HTMLElement>(`[role=row] [data-col-id="${id}"]`)!

const cellsOf = (grid: HTMLElement, id: string) => {
  const index = columns.findIndex((spec) => spec.id === id)
  // A row's first cell is the selection gutter
  return [...grid.querySelectorAll<HTMLElement>('[role=row]')].slice(1).map((row) => row.children[index + 1] as HTMLElement)
}

/** The title takes the largest share, a short status only its badge, and money its widest amount. */
export const ContentWidthChecks: Story = {
  name: 'Columns sized by content (checks)',
  tags: ['play'],
  decorators: [(Story) => <div className="flex h-screen flex-col p-4"><Story /></div>],
  play: async ({ canvasElement }) => {
    const grid = await within(canvasElement).findByRole('grid')
    await within(grid).findAllByText('Acme')
    await waitFor(() => expect(headerCell(grid, 'name').offsetWidth).toBeGreaterThan(headerCell(grid, 'status').offsetWidth * 2))
    expect(headerCell(grid, 'name').offsetWidth).toBeGreaterThan(headerCell(grid, 'city').offsetWidth)
    for (const cell of cellsOf(grid, 'revenue')) expect(cell.scrollWidth).toBeLessThanOrEqual(cell.clientWidth)
  },
}

/** In a grid too narrow for its columns, the title column stays put while the rest scroll sideways, and a cut title shows whole on hover. */
export const PinnedTitleChecks: Story = {
  name: 'The title pinned and cut in a narrow grid (checks)',
  tags: ['play'],
  decorators: [(Story) => <div className="flex h-screen w-[560px] flex-col p-4"><Story /></div>],
  play: async ({ canvasElement }) => {
    const grid = await within(canvasElement).findByRole('grid')
    await within(grid).findAllByText('Acme')
    const title = cellsOf(grid, 'name')[0]!
    await waitFor(() => expect(getComputedStyle(title).position).toBe('sticky'))
    const scroller = grid.querySelector<HTMLElement>('.overflow-x-auto')!
    await waitFor(() => expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth))
    const before = title.getBoundingClientRect().left
    const city = cellsOf(grid, 'city')[0]!
    const cityBefore = city.getBoundingClientRect().left
    scroller.scrollLeft = 200
    await waitFor(() => expect(city.getBoundingClientRect().left).toBeLessThan(cityBefore - 50))
    expect(title.getBoundingClientRect().left).toBeCloseTo(before, 0)

    const cut = within(title).getByText(names[0]!)
    expect(cut.scrollWidth).toBeGreaterThan(cut.clientWidth)
    await userEvent.hover(cut)
    expect(cut).toHaveAttribute('title', names[0])
    const whole = within(grid).getAllByText('Bonn')[0]!
    await userEvent.hover(whole)
    expect(whole).not.toHaveAttribute('title')
  },
}
