// An npm package name, `name` or `@scope/name`: each part starts with a letter, digit, `-` or `~` and holds only
// letters, digits, `.`, `_`, `~` and `-`, so it is never `.` or `..`, holds no other `/` and stays one folder in
// node_modules. Upper case is allowed, as packages from before npm's lower-case rule have it.
const packageName = /^(?:@[a-z0-9~-][\w.~-]*\/)?[a-z0-9~-][\w.~-]*$/i

/** Why `name`, listed as a dependency in `where`, is no npm package name; `undefined` when it is one. */
export const packageNameProblem = (name: string, where = 'mobile.plugins') =>
  packageName.test(name) ? undefined : `${where} lists ${JSON.stringify(name)}, which is not an npm package name such as my-plugin or @scope/my-plugin`
