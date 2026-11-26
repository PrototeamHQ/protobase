import { parseHeader } from '../../packages/cli/src/migration/snapshot/header'

// Whether the older-code job runs the release's tests: a file marked `-- protobase:breaks-older-code` says the release
// fails on it and refuses to start once it is applied, so the release's tests failing there proves nothing.

export type NewFile = { file: string; text: string }

/** Why the job skips the release's tests, naming the files, or undefined when it runs them: some new file is not marked as breaking older code, or there is none. */
export const skipReason = (files: readonly NewFile[], release: string) => {
  if (files.length === 0) return
  if (!files.every(({ text }) => parseHeader(text)?.breaksOlderCode)) return
  return `every migration new since ${release} is marked as breaking older code: ${files.map(({ file }) => file).join(', ')}`
}
