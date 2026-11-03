import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppMark, type AppMarkProps } from './app-mark'

const render = (props: AppMarkProps) => renderToStaticMarkup(createElement(AppMark, props))
// The Protobase mark's corner, which only it draws
const protobaseMark = 'fill-rule="evenodd"'

describe('AppMark', () => {
  it("draws the app's own icon", () => {
    const html = render({ appName: 'Shop & Co', appIcon: '/protobase.favicon.svg' })
    expect(html).toContain('src="/protobase.favicon.svg"')
    expect(html).not.toContain(protobaseMark)
  })

  it('draws the initial of an app with a name of its own and no icon, never the Protobase mark', () => {
    const html = render({ appName: 'Shop & Co' })
    expect(html).toContain('>S</span>')
    expect(html).not.toContain(protobaseMark)
  })

  it('draws the Protobase mark for an app that names itself nothing', () => {
    expect(render({})).toContain(protobaseMark)
    expect(render({ appName: 'Protobase' })).toContain(protobaseMark)
  })
})
