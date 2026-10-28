import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { adminAppDir } from './admin-app'
import { projectStyles } from './extensions'

const appStyles = path.join(path.dirname(adminAppDir), 'styles.css')

const transform = (plugin: ReturnType<typeof projectStyles>, code: string, id: string) =>
  (plugin.transform as (code: string, id: string) => string | undefined)(code, id)

describe('projectStyles', () => {
  it("names the project's folder as a source of the app's stylesheet, without its build output and generated files", () => {
    expect(transform(projectStyles('/work/chat', []), '@import "tailwindcss";', appStyles)).toBe(
      ['@import "tailwindcss";', '@source "/work/chat";', '@source not "/work/chat/dist";', '@source not "/work/chat/.protobase";', ''].join('\n'),
    )
  })

  it("names each extension's folder after the project's", () => {
    const code = transform(projectStyles('/work/chat', [{ dir: '/work/theme', ui: '/work/theme/protobase.ui.tsx' }]), '', `${appStyles}?direct`)
    expect(code?.split('\n').filter((line) => line.startsWith('@source "'))).toEqual(['@source "/work/chat";', '@source "/work/theme";'])
  })

  it('leaves other stylesheets alone', () => {
    expect(transform(projectStyles('/work/chat', []), '.x{}', '/work/chat/styles.css')).toBeUndefined()
  })
})
