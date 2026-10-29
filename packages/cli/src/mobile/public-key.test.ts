import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { updaterPublicKey } from './public-key'

const rsa = (modulusLength: number) => generateKeyPairSync('rsa', { modulusLength })

describe('updaterPublicKey', () => {
  const { publicKey, privateKey } = rsa(2048)
  const der = publicKey.export({ format: 'der', type: 'spki' }).toString('base64')

  it('takes a PEM RSA public key, and gives it as base64 SPKI', () => {
    expect(updaterPublicKey(publicKey.export({ format: 'pem', type: 'spki' }))).toBe(der)
  })

  it('refuses what is no RSA public key of 2048 bits', () => {
    expect(() => updaterPublicKey(undefined)).toThrow('mobile.publicKey must be a PEM public key')
    expect(() => updaterPublicKey('')).toThrow('mobile.publicKey must be a PEM public key')
    expect(() => updaterPublicKey(der)).toThrow('mobile.publicKey must be a PEM public key')
    expect(() => updaterPublicKey('-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----')).toThrow('mobile.publicKey is no public key')
    expect(() => updaterPublicKey(rsa(1024).publicKey.export({ format: 'pem', type: 'spki' }))).toThrow('at least 2048 bits, not 1024')
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey
    expect(() => updaterPublicKey(ec.export({ format: 'pem', type: 'spki' }))).toThrow('must be an RSA key, not ec')
  })

  it('refuses the private key, which belongs on the server alone', () => {
    expect(() => updaterPublicKey(privateKey.export({ format: 'pem', type: 'pkcs8' }))).toThrow('mobile.publicKey must be a PEM public key')
  })
})
