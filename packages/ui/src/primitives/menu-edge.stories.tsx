import type { Meta, StoryObj } from '@storybook/react-vite'
import { LayoutGrid, List, Rows3 } from 'lucide-react'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { GlobalSearch } from '../app-shell/global-search'
import { FilterMenu } from '../filter-panel/filter-menu'
import { LineMenu } from '../inline-child-table/line-menu'
import { MenuSelect } from './menu-select'

const viewports = { phone360: { name: 'Phone 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'Primitives/Menus at the screen edge', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const presentations = [
  { value: 'table', label: 'Table', icon: Rows3 },
  { value: 'cards', label: 'Cards with photos and prices', icon: LayoutGrid },
  { value: 'list', label: 'List', icon: List },
]

const Presentation = () => {
  const [value, setValue] = useState('table')
  return <MenuSelect value={value} options={presentations} onChange={setValue} label="Presentation" />
}

const search = { placeholder: 'Search', text: 'ada', onTextChange: () => {}, query: 'ada', loading: false, groups: [{ id: 'people', label: 'People', hits: [{ id: '1', title: 'Ada Lovelace', href: '#ada' }] }], onSelect: () => {} }

/** Every menu that opens under its trigger's right edge, at either edge of the screen, so each stays on it. */
const Edges = () => (
  <div className="flex flex-col gap-24 p-1">
    {(['justify-start', 'justify-end'] as const).map((side) => (
      <div key={side} data-side={side} className={`flex flex-col gap-24 ${side === 'justify-start' ? 'items-start' : 'items-end'}`}>
        <Presentation />
        <LineMenu label="Line actions" items={[{ label: 'Move to the top of the list', onSelect: () => {} }]} />
        <GlobalSearch search={search} className="w-40" showShortcut={false} />
        <div className="flex gap-2">
          <FilterMenu label="Type" activeCount={0}>
            Types
          </FilterMenu>
          <FilterMenu label="Status" activeCount={0} width={380}>
            Filters
          </FilterMenu>
        </div>
      </div>
    ))}
  </div>
)

export const AtTheEdges: StoryObj = { name: 'Menus at both screen edges', globals: { viewport: { value: 'phone360' } }, render: () => <Edges /> }

const viewportWidth = () => document.documentElement.clientWidth

// Opens each menu in turn and returns its box beside its trigger's
const openAll = async (canvasElement: HTMLElement, side: string) => {
  const column = within(canvasElement.querySelector<HTMLElement>(`[data-side="${side}"]`)!)
  const boxes: Array<{ name: string; menu: DOMRect; trigger: DOMRect }> = []
  const measure = async (name: string, trigger: HTMLElement, open: () => Promise<void>, menu: () => HTMLElement) => {
    await open()
    await waitFor(() => expect(menu()).toBeVisible())
    boxes.push({ name, menu: menu().getBoundingClientRect(), trigger: trigger.getBoundingClientRect() })
    await userEvent.click(document.body)
  }
  const presentation = column.getByRole('button', { name: /Presentation/ })
  await measure('presentation', presentation, () => userEvent.click(presentation), () => column.getByRole('menu', { name: 'Presentation' }))
  const line = column.getByRole('button', { name: 'Line actions' })
  await measure('line', line, () => userEvent.click(line), () => column.getByRole('menu'))
  const searchBox = column.getByRole('combobox')
  await measure('search', searchBox.closest<HTMLElement>('.relative')!, () => userEvent.click(searchBox), () => column.getByRole('listbox'))
  const status = column.getByRole('button', { name: 'Status' })
  await measure('filter', status, () => userEvent.click(status), () => column.getByText('Filters'))
  return boxes
}

export const AtTheLeftEdgeChecks: StoryObj = {
  ...AtTheEdges,
  name: 'Menus at the left screen edge (checks)',
  tags: ['play', 'phone', '!dev'],
  play: async ({ canvasElement }) => {
    for (const { name, menu } of await openAll(canvasElement, 'justify-start')) {
      expect({ name, left: menu.left >= 4 }).toEqual({ name, left: true })
      expect({ name, right: menu.right <= viewportWidth() - 4 }).toEqual({ name, right: true })
    }
  },
}

export const AtTheRightEdgeChecks: StoryObj = {
  ...AtTheEdges,
  name: 'Menus at the right screen edge (checks)',
  tags: ['play', 'phone', '!dev'],
  play: async ({ canvasElement }) => {
    for (const { name, menu, trigger } of await openAll(canvasElement, 'justify-end')) {
      expect({ name, right: Math.round(menu.right) }).toEqual({ name, right: Math.round(trigger.right) })
    }
  },
}
