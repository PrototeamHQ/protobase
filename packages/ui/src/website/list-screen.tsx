import { Download, Plus, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { ActivityChart } from '../activity-chart'
import { AppShell, PageHeader, type ShellUser, type SidebarMode } from '../app-shell'
import { DataGrid, type ColumnSpec, type RowSource } from '../data-grid'
import { FilterPanel, type FilterConfig, type FilterState } from '../filter-panel'
import { Button } from '../primitives/button'

export type ListScreenProps = {
  sidebarMode: SidebarMode
  activeItem: string
  breadcrumb: string[]
  user: ShellUser
  title: string
  subtitle: string
  newLabel: string
  columns: ColumnSpec[]
  source: RowSource
  naturalSort: { columnId: string; direction: 'asc' | 'desc' }
  filters?: { config: FilterConfig; layout: 'bar' | 'panel'; defaultValue?: FilterState; lockedLabels?: string[] }
  showChart?: boolean
  initialScrollIndex?: number
  rightPanel?: ReactNode
  assistantOpen?: boolean
}

export const ListScreen = (props: ListScreenProps) => {
  const { filters, showChart, columns, source, naturalSort, initialScrollIndex, rightPanel } = props
  const grid = <DataGrid columns={columns} source={source} naturalSort={naturalSort} initialScrollIndex={initialScrollIndex} latencyMs={0} className="min-h-0 flex-1" />
  return (
    <AppShell
      sidebarMode={props.sidebarMode}
      activeItem={props.activeItem}
      breadcrumb={props.breadcrumb}
      user={props.user}
      workspace="Veldhuis Supply"
      rightPanel={rightPanel}
      actions={
        <Button variant={props.assistantOpen ? 'primary' : 'secondary'}>
          <Sparkles className="size-3.5" />
          Assistant
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
        <PageHeader
          title={props.title}
          subtitle={props.subtitle}
          actions={
            <>
              <Button>
                <Download className="size-3.5" />
                Export
              </Button>
              <Button variant="primary">
                <Plus className="size-3.5" />
                {props.newLabel}
              </Button>
            </>
          }
        />
        {showChart && <ActivityChart title="Orders created" noun="orders" />}
        {filters?.layout === 'bar' && <FilterPanel layout="bar" config={filters.config} defaultValue={filters.defaultValue} lockedLabels={filters.lockedLabels} />}
        {filters?.layout === 'panel' ? (
          <div className="flex min-h-0 flex-1 gap-4">
            <FilterPanel layout="panel" config={filters.config} defaultValue={filters.defaultValue} lockedLabels={filters.lockedLabels} />
            {grid}
          </div>
        ) : (
          grid
        )}
      </div>
    </AppShell>
  )
}
