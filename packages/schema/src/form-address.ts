/** The path of the public forms, below the app's base path: a form is at `/-/forms/<name>`. */
export const formRoute = '/-/forms'

/** What a form's name may hold, since it is its address: lowercase letters, digits, `-` and `_`. */
export const formNamePattern = /^[a-z0-9][a-z0-9_-]*$/

/** Where a public form is: the form's name. */
export type FormAddress = {
  /** The form's name, as `.form(...)` gives it. */
  name: string
}

/** The path below the base path of the public form `name`. */
export const formPath = (name: string) => `${formRoute}/${name}`

/** The public form the path below the base path shows; `undefined` for any other path. */
export const readFormAddress = (path: string): FormAddress | undefined => {
  if (!path.startsWith(`${formRoute}/`)) return undefined
  const name = path.slice(formRoute.length + 1)
  return formNamePattern.test(name) ? { name } : undefined
}
