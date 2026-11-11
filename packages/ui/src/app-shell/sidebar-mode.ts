export const sidebarModes = ['text-large', 'text-small', 'icon', 'icon-label', 'icon-tooltip', 'icon-expand'] as const

export type SidebarMode = (typeof sidebarModes)[number]

export const showsLabelInline = (mode: SidebarMode) => mode === 'text-large' || mode === 'text-small' || mode === 'icon-expand'

export const isTextMode = (mode: SidebarMode): mode is 'text-large' | 'text-small' => mode === 'text-large' || mode === 'text-small'

// A sidebar of text grows with the text size, up to a third of the window, so a large text size leaves the page its room
export const sidebarWidth = {
  'text-large': 'w-60 max-w-[33vw]',
  'text-small': 'w-52 max-w-[33vw]',
  icon: 'w-14',
  'icon-label': 'w-[76px]',
  'icon-tooltip': 'w-14',
  'icon-expand': 'w-14',
} satisfies Record<SidebarMode, string>
