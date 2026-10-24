// A spec npm installs from a folder or a tarball on this machine (npm-package-arg's isFileSpec): `file:`, or a path
// starting with `.`, `/`, `~/` or a drive letter. Windows' `\` and `~\` forms count on every platform, as a spec in
// doubt counts as local: it only costs a fresh copy.
const localSpec = /^(?:file:|[.]|~[/\\]|[/\\]|[a-z]:)/i

/** Whether npm installs the dependency spec `spec` from this machine, copying it, rather than fetching it. */
export const isLocalSpec = (spec: string) => localSpec.test(spec)
