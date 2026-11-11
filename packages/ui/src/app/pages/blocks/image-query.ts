import type { Theme } from '../../../theme/theme-preference'

/** How far apart the widths a block without its own `width` asks for are, so resizing the window refetches only now and then. */
export const widthStep = 100

/**
 * The query an `Image` asks its function with: its own `width`, or the space it has rounded up to the next step, its
 * `height` when it has one, and the theme it is drawn in. `undefined` until the space it has is measured.
 */
export const imageQuery = ({ width, height, space, theme }: { width?: number; height?: number; space: number; theme: Theme }) => {
  const asked = width ?? Math.ceil(space / widthStep) * widthStep
  if (asked === 0) return
  return { width: String(asked), ...(height !== undefined && { height: String(height) }), theme }
}

/**
 * When the picture is asked for again: every `refresh` seconds, and never because the window regains focus or the block
 * mounts again, so without `refresh` each query is asked for once.
 */
export const imageRefetch = (refresh?: number) => ({
  staleTime: Infinity,
  refetchOnWindowFocus: false,
  ...(refresh !== undefined && { refetchInterval: refresh * 1000 }),
})
