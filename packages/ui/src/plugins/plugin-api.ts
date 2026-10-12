import packageJson from '../../package.json' with { type: 'json' }

/**
 * The plugin API this @protobase/ui provides. A plugin built for another one is not loaded. It changes only when a
 * plugin built for the previous one could break: an export of @protobase/ui removed or changed, a module shared with
 * plugins added or removed, or a new major version of React. Its exports are pinned by plugin-api.test.ts.
 */
export const pluginApi: number = packageJson.protobase.pluginApi

/** The Protobase version this @protobase/ui is: the app's, since plugins share the app's copy. */
export const protobaseVersion: string = packageJson.version
