import { describe, expect, it } from 'vitest'
import { capRunArgs } from './cap-run-args'

describe('capRunArgs', () => {
  it('runs without syncing again, on the target given', () => {
    expect(capRunArgs({ platform: 'ios', url: new URL('https://api.example.com'), target: 'ABC' })).toEqual(['run', 'ios', '--no-sync', '--target', 'ABC'])
  })

  it('forwards the API\'s port to an Android device', () => {
    expect(capRunArgs({ platform: 'android', url: new URL('http://localhost:3000') })).toEqual(['run', 'android', '--no-sync', '--forwardPorts', '3000:3000'])
    expect(capRunArgs({ platform: 'android', url: new URL('http://10.0.2.2:3000') })).toEqual(['run', 'android', '--no-sync'])
  })

  it('opens protobase dev with --live, on its port', () => {
    expect(capRunArgs({ platform: 'android', url: new URL('http://localhost:5174'), live: 5174 })).toEqual(['run', 'android', '--no-sync', '--forwardPorts', '5174:5174', '--live-reload', '--host', 'localhost', '--port', '5174'])
    expect(capRunArgs({ platform: 'ios', url: new URL('http://localhost:5173'), live: 5173 })).toEqual(['run', 'ios', '--no-sync', '--live-reload', '--host', 'localhost', '--port', '5173'])
  })
})
