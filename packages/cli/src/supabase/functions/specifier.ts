/** A package an import names, as the app's package.json lists it: its name and the version range to install. */
export type ImportedPackage = { name: string; range: string }

export type BareImport = { specifier: string; package: ImportedPackage }

// A package, its version range and a path into it, as `npm:`, `jsr:` and esm.sh write them: `@scope/name@^1/sub`.
const packageSpec = /^((?:@[^/@]+\/)?[^/@?]+)(?:@([^/?]+))?(\/[^?]*)?(?:\?.*)?$/

// esm.sh's own prefixes: a build version, `stable/`, and `*`, which leaves the dependencies external.
const esmShPrefix = /^(?:v\d+\/|stable\/)?\*?/

const parse = (spec: string) => {
  const match = packageSpec.exec(spec)
  if (!match) return undefined
  const [, name, range, path] = match
  return { name: name!, range: range ?? '*', path: path ?? '' }
}

// jsr's packages install from its npm registry, as `@jsr/<scope>__<name>` (`@jsr:registry` in .npmrc).
const jsrAlias = (name: string, range: string) => `npm:@jsr/${name.slice(1).replace('/', '__')}@${range}`

/**
 * The bare import of an `npm:`, `jsr:` or `https://esm.sh/` specifier, and the package it needs; `undefined` for any
 * other specifier. An import without a version takes any version.
 */
export const bareImport = (specifier: string): BareImport | undefined => {
  if (specifier.startsWith('npm:')) {
    const spec = parse(specifier.slice('npm:'.length))
    return spec && { specifier: spec.name + spec.path, package: { name: spec.name, range: spec.range } }
  }
  if (specifier.startsWith('jsr:')) {
    const spec = parse(specifier.slice('jsr:'.length).replace(/^\//, ''))
    if (!spec?.name.startsWith('@')) return undefined
    return { specifier: spec.name + spec.path, package: { name: spec.name, range: jsrAlias(spec.name, spec.range) } }
  }
  if (specifier.startsWith('https://esm.sh/')) {
    const spec = parse(specifier.slice('https://esm.sh/'.length).replace(esmShPrefix, ''))
    if (!spec || spec.name === 'gh' || spec.name === 'pr') return undefined
    return { specifier: spec.name + spec.path, package: { name: spec.name, range: spec.range } }
  }
  return undefined
}

/** Whether a package installs from jsr's npm registry, which .npmrc must name. */
export const isJsrPackage = (pkg: ImportedPackage) => pkg.range.startsWith('npm:@jsr/')
