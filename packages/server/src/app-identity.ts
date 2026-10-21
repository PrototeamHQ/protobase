/**
 * The `app` section of `protobase.config.ts`: the colours the installed app shows, beside its name (`createAuth`'s
 * `appName`) and its icons (`protobase.favicon.svg` and the PNGs beside it). Any CSS colour, such as `#0d9488`.
 */
export type AppIdentity = {
  /** The colour of the installed app's title bar and of the browser's toolbar around it. */
  themeColor?: string
  /** The colour of the screen an installed app shows while it starts. */
  backgroundColor?: string
}
