import type { ResourceModel } from '@protobase/schema'
import { pageFindings, type PageModel } from '@protobase/layout'

/**
 * Hears of each bare name in the pages that a nearer record shadows, which reads the nearest one as Mustache does;
 * with `strict` (`protobase build --strict`) they fail the build instead. The models are the config folder's own, so
 * every other problem of a page is left to the server's check of them all.
 */
export const checkPageScopes = (pages: PageModel[], models: ResourceModel[], { strict = false, onWarning }: { strict?: boolean; onWarning?: (message: string) => void }) => {
  const byName = Object.fromEntries(models.map((model) => [model.name, model]))
  const warnings = pages.flatMap((page) => pageFindings(page, { models: byName, actions: () => new Set() }).warnings.map((warning) => `Page "${page.name}": ${warning}`))
  if (strict && warnings.length > 0) throw new Error(`The pages read shadowed names, which --strict refuses:\n${warnings.map((warning) => `  - ${warning}`).join('\n')}`)
  for (const warning of warnings) onWarning?.(warning)
}
