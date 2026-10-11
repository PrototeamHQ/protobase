import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

/** A throwaway self-signed certificate for `hosts`, made with openssl; the browser is told to accept it. */
export const selfSignedCertificate = async (hosts: string[]) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'protobase-tls-'))
  const [key, cert] = [path.join(dir, 'key.pem'), path.join(dir, 'cert.pem')]
  const names = hosts.map((host) => `DNS:${host}`).join(',')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1', '-subj', `/CN=${hosts[0]}`, '-addext', `subjectAltName=${names}`, '-keyout', key, '-out', cert], { stdio: 'ignore' })
  const pair = { key: await readFile(key), cert: await readFile(cert) }
  await rm(dir, { recursive: true, force: true })
  return pair
}
