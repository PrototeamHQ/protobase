/**
 * Marks the iOS app's document, whose root text size then follows the phone's text size (Dynamic Type) through
 * `styles.css`. Android's WebView follows it by its text zoom, which the shell sets, and a browser by its own setting.
 */
export const applyNativeTextSize = (root: Pick<HTMLElement, 'dataset'>, platform: string) => {
  if (platform !== 'ios') return
  root.dataset.pbTextSize = 'system'
}
