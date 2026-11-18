import type { MergedConfig } from './merge-config'

/** Whether bulk mail carries a one-click unsubscribe: the one reading of `unsubscribe`, which takes only true or false. */
export const unsubscribeOn = (config: Pick<MergedConfig, 'unsubscribe'>) => {
  const value: unknown = config.unsubscribe
  if (value !== undefined && typeof value !== 'boolean') throw new Error(`unsubscribe is ${JSON.stringify(value)}; it takes true or false`)
  return value === true
}

/** The unsubscribe `createAdmin` takes: its links are on the app's public URL, which it needs. */
export const projectUnsubscribe = (config: Pick<MergedConfig, 'unsubscribe' | 'url'>) => {
  if (!unsubscribeOn(config)) return
  if (!config.url) throw new Error("unsubscribe links bulk mail to the app's public URL: set PROTOBASE_URL, such as https://admin.example.com, or url in protobase.config.ts")
  return { appUrl: config.url }
}
