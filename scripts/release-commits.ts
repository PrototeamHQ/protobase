import { ConventionalGitClient, type GitLogParams } from '@conventional-changelog/git-client'

// A pull request lands on main squash-merged, with a body that lists each of its commits' messages as a "* " item
// (see .github/workflows/pr-title.yml), so a pull request titled chore, such as a landing of a branch, can carry fixes,
// features and breaking changes. The release reads each item as a commit of its own, with the squash commit's hash,
// and the squash commit as its message above the first item. Pull requests stacked on the same branch list the same
// commits again, so an item whose message an older commit of the range lists already is left out.

// A raw commit `git log` printed, in the format the parser reads: the message (%B), then the fields, from the first
// "-hash-" line on. Only a line that starts with "* " starts an item; the lines below it, up to the next item, are its
// body and footers.
export const squashItems = (chunk: string) => {
  const fieldsAt = chunk.indexOf('\n-hash-\n')
  const message = fieldsAt === -1 ? chunk : chunk.slice(0, fieldsAt)
  const fields = fieldsAt === -1 ? '' : chunk.slice(fieldsAt)
  const lines = message.split('\n')
  const starts = lines.flatMap((line, index) => (index > 0 && line.startsWith('* ') ? [index] : []))
  if (starts.length === 0) return { commit: chunk, items: [] }

  const squash = lines.slice(0, starts[0]).join('\n').trimEnd()
  const items = starts.map((start, index) => lines.slice(start, starts[index + 1]).join('\n').slice(2).trimEnd())
  return { commit: `${squash}\n${fields}`, items: items.map((item) => ({ message: item, chunk: `${item}\n${fields}` })) }
}

// The raw commits, newest first as `git log` prints them, each followed by its items that no older commit lists.
export const withSquashItems = (chunks: string[]) => {
  const seen = new Set<string>()
  const expanded = chunks.toReversed().map((chunk) => {
    const { commit, items } = squashItems(chunk)
    const fresh = items.filter((item) => !seen.has(item.message))
    for (const item of fresh) seen.add(item.message)
    return [commit, ...fresh.map((item) => item.chunk)]
  })
  return expanded.toReversed().flat()
}

export class SquashItemsGitClient extends ConventionalGitClient {
  override async *getRawCommits(params?: GitLogParams) {
    const chunks = []
    for await (const chunk of super.getRawCommits(params)) chunks.push(chunk)
    yield* withSquashItems(chunks)
  }
}
