// Commit messages follow Conventional Commits; the release workflow computes each version from them.
// a3920861 landed on development without a type, and published history is not rewritten, so its header is let through.
const published = ["The app pool's 2 s connect timeout fails an app's first query while its scaled-to-zero database wakes on a cold PgBouncer pool"]

export default {
  extends: ['@commitlint/config-conventional'],
  ignores: [(message) => published.includes(message.split('\n')[0])],
}
