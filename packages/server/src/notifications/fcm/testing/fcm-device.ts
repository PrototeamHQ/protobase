import type { Device } from '../../device'
import { madeUpDeviceToken } from './recordings'

/** An `fcm` device for tests, the recordings' by default. */
export const fcmDevice = (change: Partial<Device> = {}): Device => ({
  id: 'device-1',
  userId: 'user-1',
  kind: 'fcm',
  token: madeUpDeviceToken,
  p256dh: null,
  auth: null,
  environment: null,
  appId: 'com.example.app',
  userAgent: null,
  sessionId: null,
  createdAt: new Date(0),
  lastSeenAt: new Date(0),
  ...change,
})
