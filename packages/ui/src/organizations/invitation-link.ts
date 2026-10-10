/** The path an emailed invitation link opens, below the app's base path. */
export const invitationLinkPath = '/-/invitation'

/** The invitation link this page was opened from: its token, or `undefined` for any other page. */
export const readInvitationLink = (href: string): { token: string } | undefined => {
  const url = new URL(href)
  const token = url.searchParams.get('token')
  return url.pathname.endsWith(invitationLinkPath) && token ? { token } : undefined
}

/** The app's start page, for the address bar once the link is used: the link's path without the invitation part. */
export const withoutInvitationLink = (href: string) => {
  const url = new URL(href)
  return `${url.pathname.slice(0, -invitationLinkPath.length)}/`
}
