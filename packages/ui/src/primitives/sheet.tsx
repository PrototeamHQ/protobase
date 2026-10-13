import { Drawer } from '@base-ui/react/drawer'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export type SheetProps = { title: string; open: boolean; onClose: () => void; children: ReactNode }

// The panel slides up on open and down on close; while a finger drags it, it follows without a transition and the
// backdrop fades as it goes. A release far or fast enough closes it, a shorter one springs it back.
const motion = 'transition-[transform,opacity] duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:duration-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] motion-reduce:duration-0'

/**
 * A panel that rises from the bottom of the screen, for the filter panel and `ResponsiveDialog` on phones. It closes
 * when swiped down, on its close button, on a press outside and on Escape, and keeps focus inside while open (Base UI's
 * `Drawer`).
 */
export const Sheet = ({ title, open, onClose, children }: SheetProps) => (
  <Drawer.Root open={open} onOpenChange={(next) => !next && onClose()}>
    <Drawer.Portal>
      <Drawer.Backdrop className={`fixed inset-0 z-[80] bg-foreground/40 opacity-[calc(1-var(--drawer-swipe-progress))] data-starting-style:opacity-0 data-ending-style:opacity-0 ${motion}`} />
      <Drawer.Viewport className="fixed inset-0 z-[80] flex items-end">
        <Drawer.Popup className={`flex max-h-[85vh] w-full flex-col rounded-t-xl border-t bg-background shadow-pop outline-none [transform:translateY(var(--drawer-swipe-movement-y))] data-starting-style:[transform:translateY(100%)] data-ending-style:[transform:translateY(100%)] data-swiping:select-none ${motion}`}>
          <div className="flex shrink-0 justify-center pt-2" aria-hidden>
            <div className="h-1 w-10 rounded-full bg-border-strong" />
          </div>
          <header className="flex shrink-0 items-center justify-between border-b px-4">
            <Drawer.Title className="text-[15px] font-semibold">{title}</Drawer.Title>
            <Drawer.Close aria-label="Close" className="-mr-2 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
              <X className="size-5" />
            </Drawer.Close>
          </header>
          <Drawer.Content className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">{children}</Drawer.Content>
        </Drawer.Popup>
      </Drawer.Viewport>
    </Drawer.Portal>
  </Drawer.Root>
)
