/**
 * The plugin whose stylesheet the layout snapshots load after the app's, as the app loads a project's UI or a plugin:
 * it has the plain utilities the app also uses with breakpoint variants, which must not undo the app's layout.
 */
export const LayoutProbe = () => (
  <div className="block inline-block flex inline-flex grid inline-grid hidden contents flex-row flex-col flex-wrap flex-nowrap items-start items-center items-end items-stretch justify-start justify-center justify-end justify-between w-full w-auto static relative absolute fixed sticky" />
)
