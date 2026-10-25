import type { z } from 'zod'
import { isPageDefinition, type PageDefinition } from '@protobase/layout'
import type { AccessSource, BottomBarSource, ComputedReveal, EventMatch, FileProcessor, UserMenuSource, ViewModel } from '@protobase/schema'
import { isSubscription } from './webhooks/subscription'

type FieldSource = { schema: z.ZodType; meta: { readOnly: boolean; nullable: boolean; file?: { derive?: Record<string, FileProcessor> } } }

/** What the server needs from a resource builder; every `resource(...)` chain satisfies it. */
export type ResourceSource = AccessSource & {
  readonly state: { fields?: Record<string, FieldSource | null> }
  readonly validators: readonly ((record: any) => Array<{ field: string; message: string }> | undefined)[]
  recordSchema(): z.ZodType
  /** Its values revealed like sensitive fields but computed when asked (`.reveals()`), by name. */
  readonly computedReveals?: Readonly<Record<string, ComputedReveal<any>>>
  /** The code predicates of its events, by event name. */
  eventMatches?(): Record<string, EventMatch<any>>
}

/**
 * Splits a config module (`import * as config from './config'`) into its resources, views, pages, subscriptions and,
 * when it exports one `userMenu(...)`, the user menu, and its `bottomBar(...)` exports in order.
 */
export const configExports = (module: Record<string, unknown>) => {
  const values = Object.values(module)
  const pages = values.filter(isPageDefinition)
  const subscriptions = [...new Set(values.filter(isSubscription))]
  const others = values.filter((value) => !isPageDefinition(value) && !isSubscription(value)) as Array<{ toModel?: unknown; recordSchema?: unknown; toUserMenuModel?: unknown; toBottomBarModel?: unknown }>
  const buildable = others.filter((value) => typeof value?.toModel === 'function')
  const menus = others.filter((value) => typeof value?.toUserMenuModel === 'function') as unknown as UserMenuSource[]
  const bottomBars = [...new Set(others.filter((value) => typeof value?.toBottomBarModel === 'function'))] as unknown as BottomBarSource[]
  if (menus.length > 1) throw new Error(`The config module exports ${menus.length} user menus; export one userMenu(...)`)
  return {
    resources: buildable.filter((value) => typeof value.recordSchema === 'function') as unknown as ResourceSource[],
    views: buildable.filter((value) => typeof value.recordSchema !== 'function') as unknown as Array<{ toModel(): ViewModel }>,
    pages: pages as PageDefinition[],
    subscriptions,
    bottomBars,
    ...(menus[0] && { userMenu: menus[0] }),
  }
}
