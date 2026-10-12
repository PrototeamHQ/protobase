import { Fragment, type ReactNode } from 'react'
import type { FilterConfig, FilterState } from './filter-config'
import { ActiveFilterChips } from './active-filter-chips'
import { DatePresets } from './date-presets'
import { FacetGroup } from './facet-group'
import { FilterMenu } from './filter-menu'
import { FilterSection } from './filter-section'
import { activeChips, emptyFilterState, removeChip, toggleFacetValue, toggleFlag } from './filter-state'
import { RangeFilter } from './range-filter'
import { ToggleRow } from './toggle-row'
import { ToolbarRow, toolbarShows } from './toolbar-row'
import { useFilterState } from './use-filter-state'

export type FilterPanelProps = {
  config: FilterConfig
  layout: 'bar' | 'panel'
  value?: FilterState
  defaultValue?: FilterState
  onChange?: (value: FilterState) => void
  /** Non-removable chips, for example a permission scope. */
  lockedLabels?: string[]
  /** Bar layout only: id of a filter menu that starts open. */
  defaultOpenMenu?: string
  /** Bar layout only: controls before the filters in their row, such as the sort. */
  leading?: ReactNode
  /** Bar layout only: a control at the end of the filters' row, such as the search. */
  trailing?: ReactNode
  /** Panel layout only: fill the available width instead of the fixed sidebar width, for the phone sheet. */
  fullWidth?: boolean
}

export const FilterPanel = ({ config, layout, value, defaultValue, onChange, lockedLabels, defaultOpenMenu, fullWidth, leading, trailing }: FilterPanelProps) => {
  const [state, setState] = useFilterState(value, defaultValue, onChange)
  const chips = activeChips(config, state)
  const chipsView = (
    <ActiveFilterChips chips={chips} lockedLabels={lockedLabels} onRemove={(key) => setState(removeChip(state, key))} onClear={() => setState(emptyFilterState)} />
  )

  const facetView = (group: FilterConfig['facets'][number]) => (
    <FacetGroup config={group} selected={state.facets[group.id] ?? []} onToggle={(option) => setState(toggleFacetValue(state, group.id, option))} />
  )
  const rangeView = config.range && <RangeFilter config={config.range} value={state.range} onChange={(range) => setState({ ...state, range })} />
  const dateView = config.datePresets && <DatePresets value={state.date} presets={Array.isArray(config.datePresets) ? config.datePresets : undefined} onChange={(date) => setState({ ...state, date })} />
  const toggleViews = (config.toggles ?? []).map((toggle) => (
    <ToggleRow key={toggle.id} label={toggle.label} checked={state.toggles.includes(toggle.id)} onChange={() => setState(toggleFlag(state, toggle.id))} />
  ))

  if (layout === 'panel') {
    return (
      <aside className={fullWidth ? 'flex w-full flex-col gap-1' : 'flex w-64 shrink-0 flex-col gap-1 overflow-y-auto rounded-lg border bg-background px-4 py-3'}>
        <div className="flex items-center justify-between pb-1">
          <h2 className="text-[13px] font-semibold">Filters</h2>
        </div>
        {(chips.length > 0 || (lockedLabels?.length ?? 0) > 0) && <div className="border-b pb-3">{chipsView}</div>}
        {config.facets.map((group) => (
          <FilterSection key={group.id} title={group.label}>
            {facetView(group)}
          </FilterSection>
        ))}
        {config.range && <FilterSection title={config.range.label}>{rangeView}</FilterSection>}
        {dateView && <FilterSection title="Date">{dateView}</FilterSection>}
        {toggleViews.length > 0 && <FilterSection title="Show only">{toggleViews}</FilterSection>}
      </aside>
    )
  }

  const menus = [
    ...config.facets.map((group) => (
      <FilterMenu key={group.id} label={group.label} activeCount={(state.facets[group.id] ?? []).length} defaultOpen={defaultOpenMenu === group.id}>
        {facetView(group)}
      </FilterMenu>
    )),
    ...(config.range
      ? [
          <FilterMenu key="range" label={config.range.label} activeCount={state.range ? 1 : 0} width={280} defaultOpen={defaultOpenMenu === config.range.id}>
            {rangeView}
          </FilterMenu>,
        ]
      : []),
    ...(dateView ? [<Fragment key="date">{dateView}</Fragment>] : []),
  ]
  const toggles = (config.toggles ?? []).map((toggle) => (
    <div key={toggle.id} className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <ToggleRow label={toggle.label} checked={state.toggles.includes(toggle.id)} onChange={() => setState(toggleFlag(state, toggle.id))} />
    </div>
  ))
  const groups = [leading ? [<Fragment key="leading">{leading}</Fragment>] : [], menus, toggles]
  if (!toolbarShows(groups, trailing) && chips.length === 0 && !lockedLabels?.length) return null

  return (
    <div className="flex flex-col gap-2">
      <ToolbarRow groups={groups} trailing={trailing} />
      {chipsView}
    </div>
  )
}
