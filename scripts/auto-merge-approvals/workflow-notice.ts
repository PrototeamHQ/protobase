// The comment that says a workflow change waits for a human merge. Its marker finds the one left before, so each pull
// request gets it once.
const marker = '<!-- auto-merge-approvals: workflow change -->'

export const workflowNotice = `${marker}\nThis pull request changes a workflow, so it waits for a human merge instead of merging on approval.`

export const noticed = (comments: { body: string }[]) => comments.some((comment) => comment.body.includes(marker))
