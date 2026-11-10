// The verdict of the coderabbit-follow-up check (.github/workflows/coderabbit-follow-up.yml). It keeps one comment, as
// the workflow's own account, whose first line is its marker and whose second line records the head it checked and its
// verdict (PrototeamHQ/coderabbit's follow-up/comment.ts). Pure: the caller reads the pull request's comments.

// user is null for a deleted account.
export type IssueComment = { user: { login: string } | null; body: string; updated_at: string }

const checkAccount = 'github-actions[bot]'
const marker = '<!-- coderabbit-follow-up -->'

// When the check last wrote a clean verdict of `head`, or null. Only the workflow's account counts, as anyone can post
// a comment with the marker, and only the first such comment, as the check updates that one.
export function cleanFollowUpAt(comments: IssueComment[], head: string) {
  const comment = comments.find((item) => item.user?.login === checkAccount && item.body.startsWith(`${marker}\n`))
  if (!comment) return null
  const verdict = comment.body.split('\n', 2)[1]
  return verdict === `<!-- checked ${head} clean -->` ? Date.parse(comment.updated_at) : null
}
