import packageJson from '../package.json' with { type: 'json' }

/** The Protobase version this server is, from @protobase/server's package.json: `/meta` names it to the admin app. */
export const protobaseVersion: string = packageJson.version
