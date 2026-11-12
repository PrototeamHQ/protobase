import { describe, expect, it } from 'vitest'
import { withFreshInstall } from './ios-fresh-install'
import { templateAppDelegate } from './ios-template-fixture'
import { withTokenForwarding } from './ios-push'

describe('withFreshInstall', () => {
  it('prepares a fresh install first thing at launch', () => {
    expect(withFreshInstall(templateAppDelegate)).toBe(templateAppDelegate
      .replace('import Capacitor\n', 'import Capacitor\nimport ProtobaseMobile\n')
      .replace('        // Override point for customization after application launch.\n', '        ProtobaseFreshInstall.prepare()\n'))
  })

  it('leaves the push setup its anchor', () => {
    expect(withTokenForwarding(withFreshInstall(templateAppDelegate))).toContain('ProtobaseFreshInstall.prepare()')
  })

  it('refuses an AppDelegate that is not the template, rather than skip the check', () => {
    const launch = '        // Override point for customization after application launch.\n'
    for (const delegate of [
      templateAppDelegate.replace(launch, ''),
      templateAppDelegate.replace('import Capacitor\n', ''),
      templateAppDelegate.replace(launch, launch + launch),
      withFreshInstall(templateAppDelegate),
    ]) {
      expect(() => withFreshInstall(delegate)).toThrow('AppDelegate.swift is not Capacitor\'s template')
    }
  })
})
