import { House } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { accountInTopBar, morePageMode, searchPlacement } from './more-page'

const tabs = (active: boolean) => [{ id: 'home', label: 'Home', icon: House, href: '/home', active }]
const menuPage = { href: '/-/menu', shown: false }

describe('morePageMode', () => {
  it('is on below the desktop width with a bottom bar and a page for the sidebar', () => {
    expect(morePageMode({ desktop: false, tabs: tabs(true), menuPage })).toEqual({ on: true, href: '/-/menu', shown: false, onTab: true })
  })

  it('says whether the page is a tab and whether it is the sidebar page', () => {
    expect(morePageMode({ desktop: false, tabs: tabs(false), menuPage: { href: '/-/menu', shown: true } })).toEqual({ on: true, href: '/-/menu', shown: true, onTab: false })
  })

  it('is off on a desktop, without a bottom bar, and without a page for the sidebar', () => {
    expect(morePageMode({ desktop: true, tabs: tabs(true), menuPage })).toEqual({ on: false })
    expect(morePageMode({ desktop: false, tabs: [], menuPage })).toEqual({ on: false })
    expect(morePageMode({ desktop: false, tabs: undefined, menuPage })).toEqual({ on: false })
    expect(morePageMode({ desktop: false, tabs: tabs(true), menuPage: undefined })).toEqual({ on: false })
  })
})

describe('accountInTopBar', () => {
  it('puts the account in the top bar on phones, with or without a bottom bar, and in the sidebar on a desktop', () => {
    expect(accountInTopBar(false)).toBe(true)
    expect(accountInTopBar(true)).toBe(false)
  })
})

describe('searchPlacement', () => {
  it('keeps search in the top bar on a desktop and on a phone without a bottom bar', () => {
    expect(searchPlacement({ desktop: true, more: false, inBottomBar: false })).toBe('top-bar')
    expect(searchPlacement({ desktop: false, more: false, inBottomBar: false })).toBe('top-bar')
  })

  it('in More page mode puts it in the bottom bar where the app asks, else on the More page', () => {
    expect(searchPlacement({ desktop: false, more: true, inBottomBar: true })).toBe('bottom-bar')
    expect(searchPlacement({ desktop: false, more: true, inBottomBar: false })).toBe('more-page')
  })
})
