import { describe, expect, it } from 'vitest'
import { connectedDevice, provisioningBuildArgs } from './ios-device'

const list = (devices: Array<{ id: string; name?: string }>) => JSON.stringify({ devices, virtualDevices: [{ id: 'SIM-1', name: 'iPhone 17' }], errors: [] })

describe('connectedDevice', () => {
  it('takes the one connected device, never a simulator', () => {
    expect(connectedDevice(list([{ id: '00008110-0001', name: 'Mitchell\'s iPhone' }]))).toBe('00008110-0001')
  })

  it('asks for --target without a device or with several', () => {
    expect(() => connectedDevice(list([]))).toThrow('none is connected')
    expect(() => connectedDevice(list([{ id: 'A', name: 'Phone' }, { id: 'B' }]))).toThrow('pass --target with one of A (Phone), B (unnamed)')
  })
})

describe('provisioningBuildArgs', () => {
  it('builds where `cap run` builds, allowed to create the profile and register the device', () => {
    expect(provisioningBuildArgs('/ws', 'DEV')).toEqual([
      'xcodebuild', '-project', 'App.xcodeproj', '-scheme', 'App', '-configuration', 'Debug', '-destination', 'id=DEV', '-derivedDataPath', '/ws/ios/DerivedData/DEV', '-allowProvisioningUpdates', '-allowProvisioningDeviceRegistration',
    ])
  })
})
