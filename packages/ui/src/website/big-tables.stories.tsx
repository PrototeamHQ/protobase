import type { Meta, StoryObj } from '@storybook/react-vite'
import { adminUser } from './users'
import { createFilteredSource, createRowSource, stockMoveColumns, stockMovesNaturalSort } from '../data-grid'
import { stockMoveFilters } from '../filter-panel'
import { stockMoveAt, stockMoveCount } from '../mocks'
import { ListScreen } from './list-screen'
import { Screen } from './screen'

const meta = { title: 'Website/BigTables', tags: ['website'], parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const amsterdamIssues = createFilteredSource(createRowSource(stockMoveCount, stockMoveAt), 1_914_900, (row) => ({
  ...row,
  kind: 'issue',
  warehouse: 'AMS-01',
  quantity: -Math.abs(Number(row.quantity)),
  reference: String(row.reference).startsWith('SO-') ? row.reference : `SO-2026-0${String(10000 + (Number(row.id) % 38000))}`,
}))

export const BigTables: StoryObj = {
  render: () => (
    <Screen>
      <ListScreen
        sidebarMode="text-small"
        activeItem="stock-moves"
        breadcrumb={['Inventory', 'Stock moves']}
        user={adminUser}
        title="Stock moves"
        subtitle="Every movement in and out of the warehouses."
        newLabel="New move"
        columns={stockMoveColumns}
        source={amsterdamIssues}
        naturalSort={stockMovesNaturalSort}
        filters={{ config: stockMoveFilters, layout: 'panel', defaultValue: { facets: { kind: ['issue'], warehouse: ['AMS-01'] }, toggles: [] } }}
        initialScrollIndex={1_214_000}
      />
    </Screen>
  ),
}
