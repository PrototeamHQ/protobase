import { formatDateTime } from '../../../format/date'
import { text } from './messages'

/** A version as its selector names it: its number and when it was saved, then whether it is the latest and the enabled one. */
export const versionLabel = (version: number, savedAt: string, { latest, enabled }: { latest: number | undefined; enabled: number | undefined }) => {
  const option = text('versionOption', { version, when: formatDateTime(Date.parse(savedAt)) })
  const marks = [...(version === latest ? [text('latest')] : []), ...(version === enabled ? [text('enabled')] : [])]
  return marks.length === 0 ? option : text('versionMarked', { option, marks: marks.join(', ') })
}

/** A run as its selector names it: when it started, its status as the runs' view labels it, and the version it ran on. */
export const runLabel = (startedAt: string, status: string, version: number) => text('runOption', { when: formatDateTime(Date.parse(startedAt)), status, version })
