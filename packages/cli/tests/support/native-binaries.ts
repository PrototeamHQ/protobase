// The smallest native binaries binaryPlatform reads like real ones: headers only, no code.

const elfMachines = { x64: 0x3e, arm64: 0xb7 }
const muslArch = { x64: 'x86_64', arm64: 'aarch64' }

// A 64-bit little-endian ELF shared object linking libstdc++ and glibc's or musl's libc, as an add-on does, and any
// other libraries given.
export const elfBinary = (arch: 'x64' | 'arm64', libc: 'glibc' | 'musl' = 'glibc', libraries: string[] = []) => {
  const needed = ['libstdc++.so.6', libc === 'musl' ? `libc.musl-${muslArch[arch]}.so.1` : 'libc.so.6', ...libraries]
  const strtab = Buffer.from(`\0${needed.join('\0')}\0`, 'latin1')
  const phoff = 64
  const phentsize = 56
  const strtabAt = phoff + 2 * phentsize
  const dynamicAt = Math.ceil((strtabAt + strtab.length) / 8) * 8
  const offsets = needed.map((_, i) => 1 + needed.slice(0, i).reduce((sum, name) => sum + name.length + 1, 0))
  const entries: Array<[number, number]> = [...offsets.map((offset): [number, number] => [1, offset]), [5, strtabAt], [0, 0]]
  const bytes = Buffer.alloc(dynamicAt + entries.length * 16)

  bytes.write('\x7fELF', 0, 'latin1')
  bytes[4] = 2
  bytes[5] = 1
  bytes[6] = 1
  bytes.writeUInt16LE(3, 16)
  bytes.writeUInt16LE(elfMachines[arch], 18)
  bytes.writeBigUInt64LE(BigInt(phoff), 32)
  bytes.writeUInt16LE(phentsize, 54)
  bytes.writeUInt16LE(2, 56)
  const segment = (index: number, type: number, offset: number, size: number) => {
    const at = phoff + index * phentsize
    bytes.writeUInt32LE(type, at)
    bytes.writeBigUInt64LE(BigInt(offset), at + 8)
    bytes.writeBigUInt64LE(BigInt(offset), at + 16)
    bytes.writeBigUInt64LE(BigInt(size), at + 32)
  }
  segment(0, 1, 0, bytes.length)
  segment(1, 2, dynamicAt, entries.length * 16)
  strtab.copy(bytes, strtabAt)
  entries.forEach(([tag, value], i) => {
    bytes.writeBigUInt64LE(BigInt(tag), dynamicAt + i * 16)
    bytes.writeBigUInt64LE(BigInt(value), dynamicAt + i * 16 + 8)
  })
  return bytes
}

export const machoBinary = (arch: 'x64' | 'arm64') => {
  const bytes = Buffer.alloc(32)
  bytes.writeUInt32LE(0xfeedfacf, 0)
  bytes.writeUInt32LE(arch === 'x64' ? 0x01000007 : 0x0100000c, 4)
  return bytes
}

export const peBinary = (arch: 'x64' | 'arm64') => {
  const bytes = Buffer.alloc(128)
  bytes.write('MZ', 0, 'latin1')
  bytes.writeUInt32LE(64, 0x3c)
  bytes.write('PE\0\0', 64, 'latin1')
  bytes.writeUInt16LE(arch === 'x64' ? 0x8664 : 0xaa64, 68)
  return bytes
}
