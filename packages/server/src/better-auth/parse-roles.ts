/**
 * The admin plugin stores roles as a comma separated string. A value written as a JS array through a Postgres driver
 * comes back as an array literal (`{admin,sales}`); that is read too, and rewritten as a plain string on the next change.
 */
export const parseRoles = (role: string | string[] | null | undefined) => {
  if (Array.isArray(role)) return role
  const text = (role ?? 'user').trim()
  const inner = text.startsWith('{') && text.endsWith('}') ? text.slice(1, -1) : text
  return inner.split(',').map((name) => name.trim().replace(/^"|"$/g, '')).filter(Boolean)
}
