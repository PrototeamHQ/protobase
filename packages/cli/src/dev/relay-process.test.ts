import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { freePort, relayUrl, startRelay } from './relay-process'

// A stand-in relay: it writes what it was started with where the test reads it, and listens on RELAY_ADDR until stopped.
const fakeRelay = (out: string) => `#!${process.execPath}
const fs = require('node:fs')
const file = process.env.RELAY_APPS_FILE
fs.writeFileSync(${JSON.stringify(out)}, JSON.stringify({ file, apps: JSON.parse(fs.readFileSync(file, 'utf8')), addr: process.env.RELAY_ADDR, env: Object.keys(process.env) }))
const [host, port] = process.env.RELAY_ADDR.split(':')
require('node:net').createServer().listen(Number(port), host)
process.on('SIGTERM', () => process.exit(0))
`

const listening = async (port: number) => {
  const socket = connect(port, '127.0.0.1')
  await once(socket, 'connect')
  socket.destroy()
}

describe.skipIf(process.platform === 'win32')('startRelay', () => {
  let dir: string
  let binary: string
  const out = () => path.join(dir, 'out.json')

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-relay-process-'))
    binary = path.join(dir, 'relay.cjs')
    await writeFile(binary, fakeRelay(out()))
    await chmod(binary, 0o755)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('serves the entry on the port with only its two variables, and stop ends it and removes its apps file', async () => {
    const port = await freePort()
    const onExit = vi.fn()
    const relay = await startRelay(binary, port, { id: 'chat' }, onExit)
    await vi.waitFor(() => listening(port))
    const seen = JSON.parse(await readFile(out(), 'utf8'))
    expect(seen.apps).toEqual({ apps: [{ id: 'chat' }] })
    expect(seen.addr).toBe(`127.0.0.1:${port}`)
    expect(seen.env.filter((name: string) => name.startsWith('RELAY_')).sort()).toEqual(['RELAY_ADDR', 'RELAY_APPS_FILE'])
    expect(relayUrl(port)).toBe(`http://127.0.0.1:${port}`)
    await relay.stop()
    expect(onExit).not.toHaveBeenCalled()
    expect(existsSync(seen.file)).toBe(false)
    await expect(listening(port)).rejects.toMatchObject({ code: 'ECONNREFUSED' })
  })

  it('tells onExit of a relay that ends by itself, once its apps file is removed', async () => {
    await writeFile(binary, `#!/bin/sh\necho "$RELAY_APPS_FILE" > ${JSON.stringify(out())}\nexit 3\n`)
    const onExit = vi.fn()
    const relay = await startRelay(binary, await freePort(), { id: 'chat' }, onExit)
    await vi.waitFor(() => expect(onExit).toHaveBeenCalledWith(3))
    expect(existsSync((await readFile(out(), 'utf8')).trim())).toBe(false)
    await relay.stop()
  })

  it('fails to start a binary that cannot run', async () => {
    await expect(startRelay(path.join(dir, 'missing'), await freePort(), { id: 'chat' }, vi.fn())).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
