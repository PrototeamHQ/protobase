/** The longest path a storage step or a local configuration's folder takes. */
export const storedPathLength = 1024

// A segment starts with a letter, digit, "_" or "-": never ".", so no "..", no hidden folder such as a store's own ".tmp/".
const segment = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/

/**
 * Whether `path` is one a storage step or configuration may name: relative, `/`-separated segments of letters, digits,
 * `.`, `_` and `-`, none starting with `.`. It refuses before any store is touched an absolute path, `..`, an empty
 * segment, `%` escapes, `\` and control characters, so a path stays inside its configuration's folder or bucket.
 */
export const isStoredPath = (path: unknown): path is string =>
  typeof path === 'string' && path.length > 0 && path.length <= storedPathLength && path.split('/').every((part) => segment.test(part))
