type ClaimsUser = { email: string; emailVerified: boolean; name?: string | null; image?: string | null }

/**
 * The claims of the person an ID token carries, by the scopes granted: `email` and `email_verified` for `email`, and
 * `name` and `picture` for `profile`. The provider serves these at userinfo only, as OpenID Connect allows; the apps
 * that take this provider's ID tokens read who the person is from the token alone, and userinfo is closed.
 */
export const idTokenClaims = ({ user, scopes }: { user: ClaimsUser; scopes: readonly string[] }) => ({
  ...(scopes.includes('email') && { email: user.email, email_verified: user.emailVerified === true }),
  ...(scopes.includes('profile') && { ...(user.name && { name: user.name }), ...(user.image && { picture: user.image }) }),
})
