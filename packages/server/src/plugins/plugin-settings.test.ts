import { describe, expect, it } from 'vitest'
import { pluginOptions, pluginsBeforeSignIn, pluginsFor } from './plugin-settings'

describe('pluginOptions', () => {
  it('lists the options first, then the URLs PROTOBASE_PLUGINS adds, each URL once', () => {
    const options = [{ url: 'https://cloud.example.com/plugins/tasks/plugin.json', roles: ['admin'] }, { url: '/plugins/board/plugin.json', settings: { columns: 3 } }]
    const env = { PROTOBASE_PLUGINS: ' https://cdn.example.com/hello/plugin.json , , https://cloud.example.com/plugins/tasks/plugin.json ' }
    expect(pluginOptions(options, env)).toEqual([...options, { url: 'https://cdn.example.com/hello/plugin.json' }])
  })

  it('is empty without plugins, and when the option is false', () => {
    expect(pluginOptions(undefined, {})).toEqual([])
    expect(pluginOptions(undefined, { PROTOBASE_PLUGINS: ' ' })).toEqual([])
    expect(pluginOptions(false, { PROTOBASE_PLUGINS: 'https://cdn.example.com/hello/plugin.json' })).toEqual([])
  })

  it("lists the bundle's plugins before all others, and keeps them when the option is false", () => {
    const env = { PROTOBASE_PLUGINS: 'https://cdn.example.com/hello/plugin.json' }
    const bundled = ['/plugins/crm/plugin.json', '/plugins/app/plugin.json']
    expect(pluginOptions([{ url: '/plugins/app/plugin.json' }], env, bundled)).toEqual([{ url: '/plugins/crm/plugin.json' }, { url: '/plugins/app/plugin.json' }, { url: 'https://cdn.example.com/hello/plugin.json' }])
    expect(pluginOptions(false, env, bundled)).toEqual([{ url: '/plugins/crm/plugin.json' }, { url: '/plugins/app/plugin.json' }])
  })

  it('loads a URL PROTOBASE_PLUGINS_BEFORE_SIGN_IN lists before sign-in, where it is first listed', () => {
    const options = [{ url: '/plugins/board/plugin.json' }, { url: 'https://cloud.example.com/cloud/plugin.json', settings: { region: 'eu' } }]
    const env = { PROTOBASE_PLUGINS: 'https://cdn.example.com/hello/plugin.json', PROTOBASE_PLUGINS_BEFORE_SIGN_IN: ' https://cloud.example.com/cloud/plugin.json , https://cloud.example.com/guest/plugin.json ' }
    expect(pluginOptions(options, env)).toEqual([
      { url: '/plugins/board/plugin.json' },
      { url: 'https://cloud.example.com/cloud/plugin.json', settings: { region: 'eu' }, beforeSignIn: true },
      { url: 'https://cdn.example.com/hello/plugin.json' },
      { url: 'https://cloud.example.com/guest/plugin.json', beforeSignIn: true },
    ])
    expect(pluginOptions(false, env)).toEqual([])
  })

  it('refuses a plugin that loads before sign-in only for some roles', () => {
    expect(() => pluginOptions([{ url: '/plugins/board/plugin.json', roles: ['admin'], beforeSignIn: true }], {})).toThrow('The plugin /plugins/board/plugin.json loads before sign-in and only for some roles')
    expect(() => pluginOptions([{ url: '/plugins/board/plugin.json', roles: ['admin'] }], { PROTOBASE_PLUGINS_BEFORE_SIGN_IN: '/plugins/board/plugin.json' })).toThrow('loads before sign-in and only for some roles')
  })

  it('refuses a value that is no http(s) URL or path, naming where it came from', () => {
    expect(() => pluginOptions(undefined, { PROTOBASE_PLUGINS: 'cdn.example.com/plugin.json' })).toThrow('PROTOBASE_PLUGINS names "cdn.example.com/plugin.json", which is no URL')
    expect(() => pluginOptions([{ url: 'ftp://cdn.example.com/plugin.json' }], {})).toThrow('options.plugins names "ftp://cdn.example.com/plugin.json", which must start with https:// or http://, not ftp://')
    expect(() => pluginOptions([{ url: '//cdn.example.com/plugin.json' }], {})).toThrow('which is no URL')
  })
})

describe('pluginsFor', () => {
  const plugins = [
    { url: 'https://cdn.example.com/hello/plugin.json' },
    { url: 'https://cloud.example.com/tasks/plugin.json', roles: ['admin', 'ai'], settings: { backend: 'https://cloud.example.com/api' } },
  ]

  it('names a plugin without roles to everyone, and one with roles to callers holding one, without its roles', () => {
    expect(pluginsFor(plugins, ['sales'])).toEqual([{ url: 'https://cdn.example.com/hello/plugin.json' }])
    expect(pluginsFor(plugins, ['ai'])).toEqual([{ url: 'https://cdn.example.com/hello/plugin.json' }, { url: 'https://cloud.example.com/tasks/plugin.json', settings: { backend: 'https://cloud.example.com/api' } }])
  })

  it('names a plugin that loads before sign-in to everyone, as any other', () => {
    expect(pluginsFor([{ url: '/plugins/guest/plugin.json', beforeSignIn: true }], [])).toEqual([{ url: '/plugins/guest/plugin.json' }])
  })
})

describe('pluginsBeforeSignIn', () => {
  it('names only the plugins that load before sign-in, with their settings', () => {
    const plugins = [{ url: '/plugins/board/plugin.json' }, { url: 'https://cloud.example.com/cloud/plugin.json', settings: { region: 'eu' }, beforeSignIn: true }]
    expect(pluginsBeforeSignIn(plugins)).toEqual([{ url: 'https://cloud.example.com/cloud/plugin.json', settings: { region: 'eu' } }])
    expect(pluginsBeforeSignIn([{ url: '/plugins/board/plugin.json' }])).toEqual([])
  })
})
