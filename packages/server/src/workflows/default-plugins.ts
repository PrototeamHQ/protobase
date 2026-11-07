import { appPlugin, gmailPlugin } from '@protobase/workflow-plugins'
import type { LoadedPlugin } from '@protobase/workflows'

const source = '@protobase/workflow-plugins'

/**
 * The plugins an app runs: the defaults, the built-in `app` first, then the app's own. An app's own plugin named like
 * a default other than `app` takes that default's place, as when it pins its own version or a test points it at a
 * fake provider; only the app's code lists plugins, never a workflow.
 */
export const workflowPlugins = (loaded: readonly LoadedPlugin[] = []): LoadedPlugin[] => {
  const own = new Set(loaded.map(({ plugin }) => (plugin as { name?: unknown } | undefined)?.name))
  const defaults = [appPlugin, gmailPlugin()].filter((plugin) => plugin.name === 'app' || !own.has(plugin.name))
  return [...defaults.map((plugin) => ({ plugin, source })), ...loaded]
}
