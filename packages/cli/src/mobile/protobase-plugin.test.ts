import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkProtobasePlugin, protobasePluginClasses } from './protobase-plugin'

let ws = ''
afterEach(() => rmSync(ws, { recursive: true, force: true }))

const listing = (classes: string[]) => {
  ws = mkdtempSync(path.join(tmpdir(), 'protobase-plugin-'))
  const assets = path.join(ws, 'android', 'app', 'src', 'main', 'assets')
  mkdirSync(assets, { recursive: true })
  writeFileSync(path.join(assets, 'capacitor.plugins.json'), JSON.stringify(classes.map((classpath) => ({ pkg: 'x', classpath }))))
  return ws
}

describe('checkProtobasePlugin', () => {
  it('passes an app that lists every class of the plugin', async () => {
    await expect(checkProtobasePlugin(listing(['com.capacitorjs.plugins.camera.CameraPlugin', ...protobasePluginClasses]))).resolves.toBeUndefined()
  })

  it('refuses an app without the plugin, naming the workspace to delete', async () => {
    const dir = listing(protobasePluginClasses.filter((name) => !name.endsWith('.LocalServerGuard')))
    await expect(checkProtobasePlugin(dir)).rejects.toThrow(`lacks Protobase's native plugin (net.protobase.mobile.LocalServerGuard): delete ${dir}`)
  })
})
