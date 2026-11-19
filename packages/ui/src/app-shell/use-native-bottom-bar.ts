import { useEffect, useRef, useState, type RefObject } from 'react'
import { nativeTabBarState, useNativeTabBar } from './native-tab-bar'
import { tabIcon } from './tab-icon'

/**
 * Draws the bottom bar `nav` as the app's native tab bar, when it has one (`NativeTabBarContext`): its tabs, by their
 * labels and the icons the web bar draws, and the current one, sent whole again whenever they change, and none once
 * the bar goes, as when `/meta` turns it off. The tab at `search`, when there is one, is search, which the native bar
 * draws as its own. A tap on a native tab clicks the web bar's tab of the same index, so it
 * does what a tap on that one does. While the native bar draws it, `native` is true and `height` the height the native
 * bar tells, the home indicator's inset included, which the web bar then keeps clear, unseen, so the page's content
 * ends above the native bar.
 */
export const useNativeBottomBar = (nav: RefObject<HTMLElement | null>, labels: string[], selected: number, search?: number) => {
  const bar = useNativeTabBar()
  const key = JSON.stringify({ labels, selected, search })

  useEffect(() => {
    const element = nav.current
    if (!bar || !element) return
    let current = true
    const icons = [...element.children].map((tab) => tabIcon(tab.querySelector('svg')))
    void Promise.all(icons).then((drawn) => {
      if (current) void bar.set(nativeTabBarState(labels, drawn, selected, search))
    })
    return () => {
      current = false
    }
    // `key` holds the labels and the current tab, which arrive as a new array on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bar, key])

  useEffect(() => {
    if (!bar) return
    return () => void bar.set({ visible: false })
  }, [bar])

  const tabs = useRef(nav)
  tabs.current = nav
  useEffect(() => bar?.onTap((index) => (tabs.current.current?.children[index] as HTMLElement | undefined)?.click()), [bar])

  const [height, setHeight] = useState<number>()
  useEffect(() => bar?.onHeight(setHeight), [bar])

  return { native: Boolean(bar), height }
}
