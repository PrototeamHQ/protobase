import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { PackageJson } from '../../src/build/packages/package-dir'
import { elfBinary, machoBinary } from './native-binaries'

// Writes an installed package: `<dir>/node_modules/<name>` with its package.json and files.
export const writePackage = async (dir: string, json: PackageJson & { name: string; type?: 'module' }, files: Record<string, string | Buffer> = {}) => {
  const packageDir = path.join(dir, 'node_modules', json.name)
  const all = { 'package.json': JSON.stringify({ version: '1.0.0', main: 'index.js', ...json }), 'index.js': 'module.exports = {}\n', ...files }
  for (const [file, content] of Object.entries(all)) {
    await mkdir(path.dirname(path.join(packageDir, file)), { recursive: true })
    await writeFile(path.join(packageDir, file), content)
  }
  return packageDir
}

// An add-on packaged as prebuildify does, loaded with node-gyp-build: prebuilds for every platform in the package,
// plus the copy a build on this macOS machine compiled into build/Release.
export const prebuildifyFiles = {
  'index.js': "module.exports = require('node-gyp-build')(__dirname)\n",
  'binding.gyp': '{}\n',
  'prebuilds/linux-x64/addon.glibc.node': elfBinary('x64'),
  'prebuilds/linux-x64/addon.musl.node': elfBinary('x64', 'musl'),
  'prebuilds/linux-arm64/addon.glibc.node': elfBinary('arm64'),
  'prebuilds/darwin-arm64/addon.node': machoBinary('arm64'),
  'build/Release/addon.node': machoBinary('arm64'),
}
