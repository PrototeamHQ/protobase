/**
 * The top bar's leading slot on a phone, one layout for the app's logo and for the back link: a 28 point box at the
 * bar's left inset, the app's mark or the back chevron, then the app's name or the page's title at the same place.
 */
export const leadingRow = 'flex min-w-0 items-center gap-2.5'

/**
 * The slot's box: the app mark's size (`AppMark`'s `sm`), which the back chevron takes too. It grows with the text only
 * up to 8% of the screen's width, as the bar's buttons do (`topBarButton`), so the title keeps its room beside it at
 * the largest text sizes.
 */
export const leadingBox = 'size-[min(1.75rem,max(28px,8vw))]'
