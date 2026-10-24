import { describe, expect, it } from 'vitest'
import { isLocalSpec, localFolder } from './local-spec'

describe('isLocalSpec', () => {
  it('takes every form npm reads as a folder on this machine', () => {
    for (const spec of ['../x', './x', '.x', '/abs/x', '~/x', 'C:\\x', 'c:/x', 'file:x', 'file:../x', 'file:///abs/x', 'FILE:x', '~\\x', '\\x']) expect(isLocalSpec(spec), spec).toBe(true)
  })

  it('leaves out versions, tags, aliases, git and URLs', () => {
    for (const spec of ['8.0.0', '^8.0.0', 'latest', '~8.0.0', 'npm:other@1.0.0', 'git+https://host/x.git', 'https://host/x.tgz', 'user/repo', '~']) expect(isLocalSpec(spec), spec).toBe(false)
  })
})

describe('localFolder', () => {
  // What npm-package-arg 13 (npm 11) gives as the folder of each spec listed in /ws/w, with the home folder /home/h.
  const npm: Array<[string, string]> = [
    ['../x', '/ws/x'],
    ['./x', '/ws/w/x'],
    ['.x', '/ws/w/.x'],
    ['/abs/x', '/abs/x'],
    ['~/x', '/home/h/x'],
    ['file:x', '/ws/w/x'],
    ['file:../x', '/ws/x'],
    ['file:///abs/x', '/abs/x'],
    ['file://host/x', '/host/x'],
    ['file:/../x', '/ws/x'],
    ['file:~/x', '/home/h/x'],
    ['./a b', '/ws/w/a b'],
    ['file:a%2fb', '/ws/w/a%2fb'],
  ]

  it.runIf(process.platform !== 'win32')('reads each spec as npm does', () => {
    for (const [spec, folder] of npm) expect(localFolder('/ws/w', spec, '/home/h'), spec).toBe(folder)
  })
})
