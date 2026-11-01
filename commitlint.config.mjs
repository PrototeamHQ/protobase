// Commit messages follow Conventional Commits; the release workflow computes each version from them.
// Published history is not rewritten, so these headers are let through: a3920861 landed on development without a type,
// and 89471dce, its squash merge to main, lists that header in its body, longer than a body line may be.
const published = [
  "The app pool's 2 s connect timeout fails an app's first query while its scaled-to-zero database wakes on a cold PgBouncer pool",
  'fix: release isNull and in() in when conditions and the PgBouncer wake timeout (#30)',
]

export default {
  extends: ['@commitlint/config-conventional'],
  ignores: [(message) => published.includes(message.split('\n')[0])],
}
