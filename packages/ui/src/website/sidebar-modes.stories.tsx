import type { Meta, StoryObj } from '@storybook/react-vite'
import { Sidebar, sidebarModes, type SidebarMode } from '../app-shell'
import { adminUser } from './users'
import { Skeleton } from '../primitives/skeleton'
import { Screen } from './screen'

const meta = { title: 'Website/SidebarModes', tags: ['website'], parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const columns: Record<SidebarMode, { width: string; title: string; note: string }> = {
  'text-large': { width: '340px', title: 'Text, large', note: 'Roomy labels and counts' },
  'text-small': { width: '300px', title: 'Text, small', note: 'Dense, more resources visible' },
  icon: { width: '120px', title: 'Icons', note: 'Most room for data' },
  'icon-label': { width: '150px', title: 'Icons with labels', note: 'Label beneath each icon' },
  'icon-tooltip': { width: '120px', title: 'Icons with tooltips', note: 'Hover for the name' },
  'icon-expand': { width: '330px', title: 'Icons, expand on hover', note: 'Overlays the content' },
}

const FakeContent = () => (
  <div className="min-w-0 flex-1 space-y-3 overflow-hidden p-4">
    <Skeleton className="h-4 w-24" />
    {Array.from({ length: 14 }, (_, row) => (
      <Skeleton key={row} className="h-3 w-full [animation:none] opacity-70" />
    ))}
  </div>
)

export const SidebarModes: StoryObj = {
  render: () => (
    <Screen>
      <div className="flex h-full gap-2 bg-surface px-4 py-8" style={{ justifyContent: 'center' }}>
        {sidebarModes.map((mode) => (
          <div key={mode} className="flex shrink-0 flex-col gap-3" style={{ width: columns[mode].width }}>
            <div>
              <div className="text-[13px] font-semibold">{columns[mode].title}</div>
              <div className="text-xs text-muted-foreground">{columns[mode].note}</div>
            </div>
            <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border bg-background">
              <Sidebar mode={mode} activeItem="orders" user={adminUser} workspace="Veldhuis Supply" forceExpanded />
              <FakeContent />
            </div>
          </div>
        ))}
      </div>
    </Screen>
  ),
}
