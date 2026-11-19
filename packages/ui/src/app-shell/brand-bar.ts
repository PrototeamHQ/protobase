/** A phone bar in the app's brand colour, as a phone app's own, up behind the status bar too. */
export const brandBar = 'bg-primary border-transparent'

/**
 * The bar's content in the brand's foreground, the theme's own `primary-foreground`: its text and every icon and link in
 * it, whatever colour class they carry elsewhere. Only on the bar's content: what covers the bar, such as search, and
 * what opens from it, which is drawn at the document's root, keep the page's colours.
 */
export const brandContent = 'text-primary-foreground [&_*]:text-primary-foreground'

/**
 * The status bar's style over a bar of `color`: light text over a dark colour, dark text over a light one, as the
 * native SystemBars plugin names them (`DARK` for a dark background).
 */
export const statusBarStyleOver = (color: string) => {
  const [r = 255, g = 255, b = 255] = (color.match(/\d+(\.\d+)?/g) ?? []).map(Number)
  return 0.299 * r + 0.587 * g + 0.114 * b < 150 ? 'DARK' : 'LIGHT'
}
