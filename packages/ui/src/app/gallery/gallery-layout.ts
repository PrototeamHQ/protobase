/** The most tiles a gallery draws: one large and four smaller. */
export const maxTiles = 5

/**
 * How many of `count` photos a gallery draws as tiles, and how many more its last tile counts ("+N"): five at most,
 * three of four so the large tile keeps its two rows beside two wide ones, every photo when there are fewer.
 */
export const galleryTiles = (count: number) => {
  const shown = count >= maxTiles ? maxTiles : count === 4 ? 3 : count
  return { shown, more: count - shown }
}

/** A swipe's step: a mostly sideways drag of 40 pixels or more moves to the next photo leftwards, the previous rightwards. */
export const swipeStep = (dx: number, dy: number) => (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy) ? 0 : dx < 0 ? 1 : -1)

/** A key's step: the right arrow moves to the next photo, the left arrow to the previous one. */
export const keyStep = (key: string) => (key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0)

/** The photo a step from `index` lands on among `count`: it stops at the first and the last rather than wrapping around. */
export const steppedPhoto = (index: number, by: number, count: number) => Math.min(Math.max(index + by, 0), Math.max(count - 1, 0))
