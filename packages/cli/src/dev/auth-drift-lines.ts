/**
 * The banner's warning that the auth store's tables drifted from its migrations, such as a column changed by hand, one
 * line per difference; nothing when they match.
 */
export const authDriftLines = (drift: string[]) =>
  drift.length === 0
    ? ''
    : `  warning  the auth store drifted from its migrations; apply the project's migrations, or write a change made by hand as a migration of the project's own:\n${drift.map((finding) => `             ${finding}\n`).join('')}`
