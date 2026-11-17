/**
 * Refuses a config with no resources, which has usually lost them by mistake, unless the app says it has none on
 * purpose with `resources: 'none'`; and refuses one that says so but exports some.
 */
export const checkResourceCount = (count: number, declared: 'none' | undefined, index: string) => {
  if (declared === 'none' && count > 0) {
    throw new Error(`${index} exports ${count === 1 ? 'a resource' : `${count} resources`}, but the config says the app has none (resources: 'none'): remove that key, or the resources`)
  }
  if (declared !== 'none' && count === 0) {
    throw new Error(`No resources exported from ${index}; an app with none on purpose says so with resources: 'none' in its config`)
  }
}
