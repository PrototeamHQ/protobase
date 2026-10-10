/** Marks a link to the staff sign-in page, for example `/?staff-sign-in&email=sanne@example.com&reason=Ticket+4211`. */
export const staffMarker = 'staff-sign-in'

/** Where the server's staff callback says why a staff sign-in did not go through. */
const errorParam = 'staff-error'

/** What a link to the staff sign-in page fills in, and why the last attempt failed when it came back with an error. */
export type StaffLink = { email: string; reason: string; error?: string }

/** The staff sign-in this page was opened for, or `undefined`. */
export const readStaffLink = (href: string): StaffLink | undefined => {
  const params = new URL(href).searchParams
  const error = params.get(errorParam)
  if (!params.has(staffMarker) && !error) return undefined
  const marked = params.has(staffMarker)
  return { email: (marked && params.get('email')) || '', reason: (marked && params.get('reason')) || '', ...(error && { error }) }
}

/** The address without the staff link's parameters: for the address bar, and the page staff come back to. */
export const withoutStaffLink = (href: string) => {
  const url = new URL(href)
  if (url.searchParams.has(staffMarker)) for (const name of [staffMarker, 'email', 'reason']) url.searchParams.delete(name)
  url.searchParams.delete(errorParam)
  return `${url.pathname}${url.search}${url.hash}`
}
