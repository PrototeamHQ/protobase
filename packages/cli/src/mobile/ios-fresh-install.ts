// The template's import and the comment that opens didFinishLaunchingWithOptions, which `withFreshInstall` edits.
const importLine = 'import Capacitor\n'
const launchLine = '        // Override point for customization after application launch.\n'

/**
 * Capacitor's AppDelegate.swift preparing a fresh install first thing at launch, before the bridge reads what a live
 * update left: an app a backup restored, or one moved to another iPhone, starts signed out with no drafts and no live
 * update. Throws on any other AppDelegate rather than build an app that skips it.
 */
export const withFreshInstall = (delegate: string) => {
  if (delegate.split(importLine).length !== 2 || delegate.split(launchLine).length !== 2 || delegate.includes('ProtobaseMobile')) {
    throw new Error('AppDelegate.swift is not Capacitor\'s template: it needs its one `import Capacitor` and one launch comment, and no ProtobaseMobile')
  }
  return delegate
    .replace(importLine, `${importLine}import ProtobaseMobile\n`)
    .replace(launchLine, '        ProtobaseFreshInstall.prepare()\n')
}
