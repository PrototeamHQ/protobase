// Commit messages follow Conventional Commits; the release workflow computes each version from them.
// Published history is not rewritten, so these headers are let through: a3920861 landed on development without a type,
// and 89471dce, its squash merge to main, lists that header in its body, longer than a body line may be. The other four
// landed on development without a type and reach main in its landing pull requests.
const published = [
  "The app pool's 2 s connect timeout fails an app's first query while its scaled-to-zero database wakes on a cold PgBouncer pool",
  'fix: release isNull and in() in when conditions and the PgBouncer wake timeout (#30)',
  "Protobase's live connection polls first, then switches to a WebSocket",
  'Browser error reporting drops errors not raised by our own code',
  'Changing a password signs out other sessions, emails the owner and limits guesses',
  "Fix the skeptic's open findings on the plan of pb-mobile-plan-plan-3",
]

export default {
  extends: ['@commitlint/config-conventional'],
  ignores: [(message) => published.includes(message.split('\n')[0])],
}
