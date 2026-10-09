// The platform a native binary (an add-on `.node` file, a shared library, an executable) is built for, read from its
// headers rather than its name: `linux-x64`, `linux-arm64-musl`, `darwin-arm64`, `win32-x64`, ... Undefined for a
// file that is no ELF, Mach-O or PE binary.

const elfMachines: Record<number, string> = { 0x03: 'ia32', 0x28: 'arm', 0x3e: 'x64', 0xb7: 'arm64', 0xf3: 'riscv64' }
const machoCpus: Record<number, string> = { 0x01000007: 'x64', 0x0100000c: 'arm64' }
const peMachines: Record<number, string> = { 0x14c: 'ia32', 0x8664: 'x64', 0xaa64: 'arm64' }

const ptLoad = 1
const ptDynamic = 2
const dtNeeded = 1
const dtStrtab = 5

const fits = (bytes: Buffer, offset: number, length: number) => offset >= 0 && offset + length <= bytes.length

const cString = (bytes: Buffer, offset: number) => {
  const end = bytes.indexOf(0, offset)
  return bytes.toString('latin1', offset, end < 0 ? bytes.length : end)
}

// The shared libraries a 64-bit little-endian ELF file links (DT_NEEDED): they tell glibc from musl, and must all be
// found where the binary runs.
const elfNeeded = (bytes: Buffer): string[] => {
  const phoff = Number(bytes.readBigUInt64LE(32))
  const phentsize = bytes.readUInt16LE(54)
  const phnum = bytes.readUInt16LE(56)
  if (phentsize < 40 || !fits(bytes, phoff, phentsize * phnum)) return []
  const segments = Array.from({ length: phnum }, (_, i) => {
    const at = phoff + i * phentsize
    return { type: bytes.readUInt32LE(at), offset: Number(bytes.readBigUInt64LE(at + 8)), vaddr: Number(bytes.readBigUInt64LE(at + 16)), size: Number(bytes.readBigUInt64LE(at + 32)) }
  })
  const dynamic = segments.find((segment) => segment.type === ptDynamic)
  if (!dynamic || !fits(bytes, dynamic.offset, dynamic.size)) return []
  const entries = Array.from({ length: Math.floor(dynamic.size / 16) }, (_, i) => ({
    tag: bytes.readBigUInt64LE(dynamic.offset + i * 16),
    value: Number(bytes.readBigUInt64LE(dynamic.offset + i * 16 + 8)),
  }))
  const strtab = entries.find((entry) => entry.tag === BigInt(dtStrtab))?.value
  const load = segments.find((segment) => segment.type === ptLoad && strtab !== undefined && strtab >= segment.vaddr && strtab < segment.vaddr + segment.size)
  if (strtab === undefined || !load) return []
  const strings = strtab - load.vaddr + load.offset
  return entries
    .filter((entry) => entry.tag === BigInt(dtNeeded) && fits(bytes, strings + entry.value, 1))
    .map((entry) => cString(bytes, strings + entry.value))
}

const isElf64le = (bytes: Buffer) => bytes.length >= 64 && bytes.toString('latin1', 0, 4) === '\x7fELF' && bytes[4] === 2 && bytes[5] === 1

// The libraries a 64-bit little-endian ELF binary (linux x64 and arm64) needs, by file name (`libc.so.6`); none for
// any other file.
export const binaryLibraries = (bytes: Buffer): string[] => (isElf64le(bytes) ? elfNeeded(bytes) : [])

const elfPlatform = (bytes: Buffer) => {
  const os = bytes[7] === 9 ? 'freebsd' : 'linux'
  const bigEndian = bytes[5] === 2
  const machine = bytes.length < 20 ? undefined : bigEndian ? bytes.readUInt16BE(18) : bytes.readUInt16LE(18)
  const arch = (machine !== undefined && elfMachines[machine]) || 'other'
  // x64 and arm64 binaries are 64-bit little-endian; for anything else the libc does not matter.
  if (!isElf64le(bytes)) return `${os}-${arch}`
  // glibc's libc is always libc.so.6; musl's is libc.so, or libc.musl-<arch>.so.1 as Alpine names it.
  const musl = elfNeeded(bytes).some((library) => library === 'libc.so' || library.includes('musl'))
  return `${os}-${arch}${musl ? '-musl' : ''}`
}

const machoPlatform = (bytes: Buffer) => {
  const magic = bytes.readUInt32BE(0)
  // 0xcafebabe is also a Java class file, whose second word (its version) is 45 or more; a fat binary's is its arch count.
  if ((magic === 0xcafebabe || magic === 0xcafebabf) && bytes.readUInt32BE(4) < 20) return 'darwin-universal'
  if (magic === 0xcffaedfe || magic === 0xcefaedfe) return `darwin-${machoCpus[bytes.readUInt32LE(4)] ?? 'other'}`
  if (magic === 0xfeedfacf || magic === 0xfeedface) return `darwin-${machoCpus[bytes.readUInt32BE(4)] ?? 'other'}`
  return undefined
}

const pePlatform = (bytes: Buffer) => {
  if (bytes.length < 64 || bytes.toString('latin1', 0, 2) !== 'MZ') return undefined
  const header = bytes.readUInt32LE(0x3c)
  if (!fits(bytes, header, 6) || bytes.toString('latin1', header, header + 4) !== 'PE\0\0') return undefined
  return `win32-${peMachines[bytes.readUInt16LE(header + 4)] ?? 'other'}`
}

export const binaryPlatform = (bytes: Buffer): string | undefined => {
  if (bytes.length < 8) return undefined
  if (bytes.toString('latin1', 0, 4) === '\x7fELF') return elfPlatform(bytes)
  return machoPlatform(bytes) ?? pePlatform(bytes)
}
