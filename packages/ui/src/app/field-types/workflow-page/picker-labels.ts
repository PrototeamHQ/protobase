import { text } from './messages'

/** A version as its picker names it: its number, then whether it is the latest and whether it is live. */
export const versionLabel = (version: number, { latest, enabled }: { latest: number | undefined; enabled: number | undefined }) => {
  if (version === latest) return version === enabled ? text('versionLatestLive', { version }) : text('versionLatestDraft', { version })
  return version === enabled ? text('versionLive', { version }) : text('versionNumber', { version })
}
