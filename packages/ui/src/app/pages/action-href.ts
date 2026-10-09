/** `href` with every `{field}` replaced by the record's value, percent-encoded; a missing value becomes empty. */
export const fillHref = (href: string, record: Record<string, unknown> = {}) =>
  href.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => encodeURIComponent(record[name] === null || record[name] === undefined ? '' : String(record[name])))

/** Paths in the app start with one `/`; anything else (`https:`, `mailto:`, `//host`) leaves the app. */
export const isAppPath = (href: string) => href.startsWith('/') && !href.startsWith('//')
