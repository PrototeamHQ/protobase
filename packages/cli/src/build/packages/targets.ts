import type { PackageJson } from './package-dir'

// Where a bundle runs: the run image, Bun's distroless image (Debian, so glibc), is published for amd64 and arm64,
// and a bundle may land on either. Labels as binaryPlatform names them; a label without `-musl` is glibc.
export const bundleTargets = ['linux-x64', 'linux-arm64'] as const

export const isTarget = (platform: string) => (bundleTargets as readonly string[]).includes(platform)

// The shared libraries a binary may link besides those the bundle carries: glibc's, as the run image has them, and
// the C++ runtime (libstdc++, libgcc_s) that compiled add-ons link, which the run image has to add to Bun's.
export const runImageLibraries: ReadonlySet<string> = new Set([
  'ld-linux-x86-64.so.2',
  'ld-linux-aarch64.so.1',
  'libc.so.6',
  'libm.so.6',
  'libmvec.so.1',
  'libdl.so.2',
  'libpthread.so.0',
  'librt.so.1',
  'libresolv.so.2',
  'libutil.so.1',
  'libanl.so.1',
  'libnsl.so.1',
  'libBrokenLocale.so.1',
  'libthread_db.so.1',
  'libc_malloc_debug.so.0',
  'libnss_compat.so.2',
  'libnss_dns.so.2',
  'libnss_files.so.2',
  'libnss_hesiod.so.2',
  'libstdc++.so.6',
  'libgcc_s.so.1',
])

// A package.json `os`, `cpu` or `libc` list allows a value: no list, a list naming it, or only exclusions (`!win32`)
// that leave it out.
const allows = (list: string[] | undefined, value: string) => {
  if (!list?.length) return true
  if (list.includes(`!${value}`)) return false
  return list.includes(value) || list.every((item) => item.startsWith('!'))
}

// A package for some platforms only, such as `@node-rs/argon2-linux-x64-gnu`; a package manager skips it elsewhere.
export const isPlatformPackage = (json: PackageJson) => Boolean(json.os?.length || json.cpu?.length || json.libc?.length)

// The targets a package installs on, by its os, cpu and libc fields.
export const packageTargets = (json: PackageJson) =>
  bundleTargets.filter((target) => {
    const [os, cpu] = target.split('-') as [string, string]
    return allows(json.os, os) && allows(json.cpu, cpu) && allows(json.libc, 'glibc')
  })
