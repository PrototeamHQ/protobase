/** The position shown after `step` presses forward, or back when negative, wrapping around both ends. */
export const shownSlide = (step: number, count: number) => (count === 0 ? 0 : ((step % count) + count) % count)

/** The position a track of `count` slides, each `width` wide, shows when scrolled to `left`: the one mostly in view. */
export const scrolledSlide = (left: number, width: number, count: number) => (width <= 0 || count === 0 ? 0 : Math.min(count - 1, Math.max(0, Math.round(left / width))))
