import { describe, expect, it } from 'vitest'
import { withLocalNetworking } from './info-plist'

const plist = '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n\t<key>UIViewControllerBasedStatusBarAppearance</key>\n\t<true/>\n</dict>\n</plist>\n'

describe('withLocalNetworking', () => {
  it('allows local networking, and nothing else, at the end of the dict', () => {
    const changed = withLocalNetworking(plist)
    expect(changed).toContain('<key>NSAppTransportSecurity</key>\n\t<dict>\n\t\t<key>NSAllowsLocalNetworking</key>\n\t\t<true/>\n\t</dict>\n</dict>\n</plist>\n')
    expect(changed).not.toContain('NSAllowsArbitraryLoads')
  })

  it('refuses a plist that has its own transport security, or no end', () => {
    expect(() => withLocalNetworking(withLocalNetworking(plist))).toThrow('already has NSAppTransportSecurity')
    expect(() => withLocalNetworking('<plist>')).toThrow('does not end with')
  })
})
