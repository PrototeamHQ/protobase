import { expectTypeOf } from 'vitest'
import type { Device, NewDevice } from './device'
import type { DeviceStore } from './device-store'
import { deviceStoreContract } from './testing/device-store-contract'
import { memoryDeviceStore } from './testing/memory-store'

deviceStoreContract('in memory', async () => memoryDeviceStore())

// The interface is plain data: strings, arrays and the device records, nothing of a database.
expectTypeOf<Parameters<DeviceStore['register']>>().toEqualTypeOf<[userId: string, device: NewDevice]>()
expectTypeOf<ReturnType<DeviceStore['listByIds']>>().toEqualTypeOf<Promise<Device[]>>()
expectTypeOf<{ [K in keyof Device]: Device[K] }>().toEqualTypeOf<{
  kind: 'web' | 'apns' | 'fcm'
  token: string
  p256dh: string | null
  auth: string | null
  environment: 'sandbox' | 'production' | null
  appId: string | null
  userAgent: string | null
  id: string
  userId: string
  createdAt: Date
  lastSeenAt: Date
}>()
