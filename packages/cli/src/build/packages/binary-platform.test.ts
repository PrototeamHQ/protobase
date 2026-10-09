import { describe, expect, it } from 'vitest'
import { elfBinary, machoBinary, peBinary } from '../../../tests/support/native-binaries'
import { binaryLibraries, binaryPlatform } from './binary-platform'

describe('binaryPlatform', () => {
  it('names linux binaries by architecture and tells musl from glibc by the libc they link', () => {
    expect(binaryPlatform(elfBinary('x64'))).toBe('linux-x64')
    expect(binaryPlatform(elfBinary('arm64'))).toBe('linux-arm64')
    expect(binaryPlatform(elfBinary('x64', 'musl'))).toBe('linux-x64-musl')
    expect(binaryPlatform(elfBinary('arm64', 'musl'))).toBe('linux-arm64-musl')
    // bcrypt 6's linux-arm64 musl build links musl's libc by its own name.
    const bareMusl = elfBinary('arm64')
    bareMusl.write('libc.so\0', bareMusl.indexOf('libc.so.6'), 'latin1')
    expect(binaryPlatform(bareMusl)).toBe('linux-arm64-musl')
  })

  it('names macOS and Windows binaries', () => {
    expect(binaryPlatform(machoBinary('arm64'))).toBe('darwin-arm64')
    expect(binaryPlatform(machoBinary('x64'))).toBe('darwin-x64')
    const fat = Buffer.alloc(32)
    fat.writeUInt32BE(0xcafebabe, 0)
    fat.writeUInt32BE(2, 4)
    expect(binaryPlatform(fat)).toBe('darwin-universal')
    expect(binaryPlatform(peBinary('x64'))).toBe('win32-x64')
  })

  it('leaves other architectures and 32-bit files out of the targets', () => {
    const riscv = elfBinary('x64')
    riscv.writeUInt16LE(0xf3, 18)
    expect(binaryPlatform(riscv)).toBe('linux-riscv64')
    const arm32 = elfBinary('x64')
    arm32[4] = 1
    arm32.writeUInt16LE(0x28, 18)
    expect(binaryPlatform(arm32)).toBe('linux-arm')
  })

  it('reads a truncated ELF file without throwing', () => {
    expect(binaryPlatform(elfBinary('x64').subarray(0, 100))).toBe('linux-x64')
  })

  it('lists the libraries a linux binary links, and none for other files', () => {
    expect(binaryLibraries(elfBinary('arm64', 'glibc', ['libvips-cpp.so.42']))).toEqual(['libstdc++.so.6', 'libc.so.6', 'libvips-cpp.so.42'])
    expect(binaryLibraries(machoBinary('arm64'))).toEqual([])
    expect(binaryLibraries(Buffer.from('#!/bin/sh\n'))).toEqual([])
  })

  it('is undefined for files that are no binaries, including Java classes', () => {
    expect(binaryPlatform(Buffer.from('module.exports = require("node-gyp-build")(__dirname)\n'))).toBeUndefined()
    expect(binaryPlatform(Buffer.from('MZ is not a PE header without its signature, padded to be long enough.'))).toBeUndefined()
    const javaClass = Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 52])
    expect(binaryPlatform(javaClass)).toBeUndefined()
    expect(binaryPlatform(Buffer.alloc(0))).toBeUndefined()
  })
})
