import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Logo, type ShellLogoProps } from './logo'

const render = (props: ShellLogoProps) => renderToStaticMarkup(createElement(Logo, props))

describe('Logo', () => {
  it("shows the app's own name beside the mark, the workspace under it", () => {
    const html = render({ compact: false, appName: 'Property Finder', workspace: 'Rijnland' })
    expect(html).toContain('>Property Finder</div>')
    expect(html).toContain('>Rijnland</div>')
    expect(html).not.toContain('aria-label="Protobase"')
  })

  it("draws Protobase's wordmark for an app that names itself nothing, and the mark alone when compact", () => {
    expect(render({ compact: false })).toContain('aria-label="Protobase"')
    expect(render({ compact: false, appName: 'Protobase' })).toContain('aria-label="Protobase"')
    expect(render({ compact: true, appName: 'Property Finder' })).not.toContain('Property Finder')
  })

  it("draws the app's own icon in place of Protobase's mark, its name beside it even when it goes by Protobase's", () => {
    const html = render({ compact: false, appName: 'Property Finder', appIcon: '/protobase.favicon.svg' })
    expect(html).toContain('src="/protobase.favicon.svg"')
    expect(html).toContain('>Property Finder</div>')
    expect(render({ compact: false, appIcon: '/protobase.favicon.svg' })).toContain('>Protobase</div>')
    expect(render({ compact: true, appIcon: '/protobase.favicon.svg' })).not.toContain('<path')
  })
})
