// What publish.mjs does after `npm publish` of a tarball failed, from npm's output and the attempt that failed (from 1).
//
// npm signs the provenance with an identity token it fetches from GitHub's OIDC endpoint before it uploads anything,
// and that fetch now and then fails with IDENTITY_TOKEN_READ_ERROR: the publish is tried again.
//
// npm then records the provenance in Sigstore's transparency log, Rekor, and tries that upload again itself when Rekor
// is slow or answers 5xx. When the first upload was recorded after all, the second is refused with a 409, "an equivalent
// entry already exists", and npm stops before it uploads the tarball, as six packages of the 0.62.2 release did. A new
// publish signs with a new key, so Rekor takes its entry: when npm does not have the version, the publish is tried
// again; when it has, an earlier publish uploaded the tarball, and it counts as published. `published` is whether npm
// has the version, which only this case needs.
//
// Each case is tried up to 3 times; any other failure fails the publish at once.
export const maxAttempts = 3

export const isTlogConflict = (output) => output.includes('npm error code TLOG_CREATE_ENTRY_ERROR') && output.includes('(409)')

const isIdentityTokenError = (output) => output.includes('npm error code IDENTITY_TOKEN_READ_ERROR')

// 'published', 'retry' or 'fail'.
export const nextStep = ({ output, attempt, published = false }) => {
  if (isTlogConflict(output) && published) return 'published'
  if (attempt >= maxAttempts) return 'fail'
  if (isTlogConflict(output) || isIdentityTokenError(output)) return 'retry'
  return 'fail'
}
