import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { topBarButton, useTopBarSlot } from '../app-shell'
import { ActionMenu } from '../record-view/action-menu'
import { buttonClass, Button } from '../primitives/button'
import { useIsDesktop } from '../lib/use-media-query'
import type { FocusSize } from './bar-size'
import { useFocusParts } from './focus-context'
import type { FocusAction } from './focus-store'
import { text } from './messages'

/** The most actions the bar shows by name. */
const namedLimit = 2

const Named = ({ action }: { action: FocusAction }) => {
  const Icon = action.icon
  const content = (
    <>
      <Icon className="size-3.5" aria-hidden />
      {action.name}
    </>
  )
  if (action.render && !action.blocked) return action.render({ className: buttonClass(), children: content })
  return (
    <Button variant={action.tone === 'danger' ? 'danger' : 'secondary'} onClick={() => !action.blocked && action.onRun?.()} aria-disabled={Boolean(action.blocked)} loading={action.running} title={action.blocked}>
      {content}
    </Button>
  )
}

// Those that ask to be in the bar by name, while there is room
const namedOf = (actions: readonly FocusAction[], size: FocusSize) => (size === 'wide' || size === 'medium' ? actions.filter((action) => action.inBar).slice(0, namedLimit) : [])

/** The actions the bar shows by name, at most two. */
export const BarNamed = () => {
  const { store, size } = useFocusParts()
  const actions = useSyncExternalStore(store.subscribe, store.actions)
  return namedOf(actions, size).map((action) => <Named key={action.name} action={action} />)
}

/** The other actions behind "...", last in the bar; on a mobile screen it sits in the top bar, as a record's actions do. */
export const BarMenu = () => {
  const { store, size } = useFocusParts()
  const actions = useSyncExternalStore(store.subscribe, store.actions)
  const slot = useTopBarSlot()
  const desktop = useIsDesktop()
  const named = namedOf(actions, size)
  const rest = actions.filter((action) => !named.includes(action))
  // What destroys something stays last, whichever part offers what
  const menu = [...rest.filter((action) => action.tone !== 'danger'), ...rest.filter((action) => action.tone === 'danger')]
  if (slot && !desktop) return createPortal(<ActionMenu actions={menu} label={text('more')} className={topBarButton} />, slot)
  return <ActionMenu actions={menu} label={text('more')} className={buttonClass({ size: 'icon' })} />
}
