// The GitHub REST calls the auto-merge makes, with the workflow's token. Any answer not named here throws.
import type { CheckRun, CommitStatus, WorkflowRun } from './checks'
import type { PullRequest, Review, TimelineEvent } from './decision'
import type { CommitPull } from './target'

const api = 'https://api.github.com'

export function gitHub(token: string, repository: string) {
  const repo = `/repos/${repository}`
  const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' }
  const send = (path: string, init: RequestInit = {}) => fetch(`${api}${path}`, { ...init, headers })

  async function request(path: string, init: RequestInit = {}) {
    const response = await send(path, init)
    if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${init.method ?? 'GET'} ${path}`)
    return response
  }
  const read = async <T>(path: string) => (await (await request(path)).json()) as T

  // Every page of a list, which some answers wrap in an object under `key`.
  async function all<T>(path: string, key?: string) {
    const items: T[] = []
    for (let page = 1; ; page++) {
      const answer = await read<T[] | Record<string, T[]>>(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`)
      const batch = key ? (answer as Record<string, T[]>)[key]! : (answer as T[])
      items.push(...batch)
      if (batch.length < 100) return items
    }
  }

  return {
    pullRequest: (number: number) =>
      read<PullRequest & { merged: boolean; mergeable_state: string }>(`${repo}/pulls/${number}`),
    commitPulls: (sha: string) => read<CommitPull[]>(`${repo}/commits/${sha}/pulls?per_page=100`),
    timeline: (number: number) => all<TimelineEvent>(`${repo}/issues/${number}/timeline`),
    reviews: (number: number) => all<Review>(`${repo}/pulls/${number}/reviews`),

    // The login's role, or empty for an account the API does not know, such as an app.
    async role(login: string) {
      const response = await send(`${repo}/collaborators/${encodeURIComponent(login)}/permission`)
      if (response.status === 404) return ''
      if (!response.ok) throw new Error(`GitHub answered ${response.status} for the role of ${login}`)
      return ((await response.json()) as { role_name: string }).role_name
    },

    workflowId: async (run: string) => (await read<WorkflowRun>(`${repo}/actions/runs/${run}`)).workflow_id,
    workflowRuns: (sha: string) => all<WorkflowRun>(`${repo}/actions/runs?head_sha=${sha}`, 'workflow_runs'),
    checkRuns: (sha: string) => all<CheckRun>(`${repo}/commits/${sha}/check-runs`, 'check_runs'),
    statuses: (sha: string) => all<CommitStatus>(`${repo}/commits/${sha}/status`, 'statuses'),

    // Squashes only while the head is still `sha`. Answers the merge commit, or null when GitHub refused with 405 or 409.
    async merge(number: number, sha: string) {
      const path = `${repo}/pulls/${number}/merge`
      const response = await send(path, { method: 'PUT', body: JSON.stringify({ sha, merge_method: 'squash' }) })
      if (response.status === 405 || response.status === 409) return null
      if (!response.ok) throw new Error(`GitHub answered ${response.status} for PUT ${path}`)
      return ((await response.json()) as { sha: string }).sha
    },

    async dispatchWorkflow(workflow: string, ref: string) {
      await request(`${repo}/actions/workflows/${workflow}/dispatches`, { method: 'POST', body: JSON.stringify({ ref }) })
    },
    async dispatch(eventType: string, payload: Record<string, unknown>) {
      await request(`${repo}/dispatches`, { method: 'POST', body: JSON.stringify({ event_type: eventType, client_payload: payload }) })
    },

    deletesHeadOnMerge: async () => (await read<{ delete_branch_on_merge: boolean }>(repo)).delete_branch_on_merge,
    openPullsOnto: async (base: string) => (await read<unknown[]>(`${repo}/pulls?state=open&base=${encodeURIComponent(base)}&per_page=100`)).length,

    // GitHub answers 422 for a branch that is gone already.
    async deleteBranch(branch: string) {
      const path = `${repo}/git/refs/heads/${branch.split('/').map(encodeURIComponent).join('/')}`
      const response = await send(path, { method: 'DELETE' })
      if (!response.ok && response.status !== 422) throw new Error(`GitHub answered ${response.status} for DELETE ${path}`)
    },
  }
}
