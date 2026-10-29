/** What a release's order is computed from: when its bundle was built, and the shell served in place of the bundle's copy. */
export type ReleaseOrderInput = { builtAt?: number; shell?: { builtAt?: number } }

/**
 * The order of a release: when its bundle was built, then when the server's own shell it serves instead of the
 * bundle's copy was built, 0 with the copy. `undefined` when the bundle or that shell names no build time. The mobile
 * app's built-in files are a bundle's copy, so their order is `[builtAt, 0]`.
 */
export const releaseOrder = ({ builtAt, shell }: ReleaseOrderInput) => {
  if (builtAt === undefined) return
  if (!shell) return [builtAt, 0]
  if (shell.builtAt === undefined) return
  return [builtAt, shell.builtAt]
}

/** An order as the Android live updater reads it, such as `1800000000000,0`. */
export const formatReleaseOrder = (order: number[]) => order.join(',')
