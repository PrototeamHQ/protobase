import type { ResourceModel, ViewModel } from '@protobase/schema'
import { pageFindings, type PageModel } from '@protobase/layout'
import { recordBlocksOf } from '@protobase/server'

/**
 * Hears of each bare name in the pages, and in the block trees of the views' record pages, that a nearer record
 * shadows, which reads the nearest one as Mustache does; with `strict` (`protobase build --strict`) they fail the build
 * instead. The models are the config folder's own, so every other problem of a page is left to the server's check of
 * them all.
 */
export const checkPageScopes = (pages: PageModel[], models: ResourceModel[], { strict = false, onWarning, views = [] }: { strict?: boolean; onWarning?: (message: string) => void; views?: ViewModel[] }) => {
  const byName = Object.fromEntries(models.map((model) => [model.name, model]))
  const input = { models: byName, actions: () => new Set<string>() }
  const warnings = [
    ...pages.flatMap((page) => pageFindings(page, input).warnings.map((warning) => `Page "${page.name}": ${warning}`)),
    ...recordBlocksOf(views, input).warnings,
  ]
  if (strict && warnings.length > 0) throw new Error(`The pages read shadowed names, which --strict refuses:\n${warnings.map((warning) => `  - ${warning}`).join('\n')}`)
  for (const warning of warnings) onWarning?.(warning)
}
