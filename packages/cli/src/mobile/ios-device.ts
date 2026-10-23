import path from 'node:path'
import type { CaptureChild } from './capture-child'
import type { ChildOptions } from './child-process'
import { installedPackage } from './installed-package'

type Target = { id: string; name?: string }

/** The connected iPhone or iPad in native-run's `ios --list --json`, the list `cap run` picks its target from. */
export const connectedDevice = (list: string) => {
  const { devices } = JSON.parse(list) as { devices: Target[] }
  const [device, ...more] = devices
  if (!device) throw new Error('--team signs the app for an iPhone, and none is connected: connect it and unlock it, or pass --target')
  if (more.length > 0) throw new Error(`Several devices are connected: pass --target with one of ${devices.map(({ id, name }) => `${id} (${name ?? 'unnamed'})`).join(', ')}`)
  return device.id
}

/** Lists the iOS targets with the workspace's own native-run, the one Capacitor runs. */
export const listIosTargets = (ws: string, env: ChildOptions['env'], capture: CaptureChild) => {
  const { bin } = installedPackage(ws, 'native-run')
  if (!bin?.['native-run']) throw new Error(`${path.join(ws, 'node_modules', 'native-run')} has no native-run command`)
  return capture('node', [path.join(ws, 'node_modules', 'native-run', bin['native-run']), 'ios', '--list', '--json'], { cwd: ws, env })
}

/**
 * xcodebuild's arguments for the build `cap run ios --target <target>` makes, the same destination and derived data so
 * Capacitor's own build after it has nothing left to do, but allowed to create the team's development profile and
 * register the device with it, which Capacitor's build is not.
 */
export const provisioningBuildArgs = (ws: string, target: string) => [
  'xcodebuild',
  '-project',
  'App.xcodeproj',
  '-scheme',
  'App',
  '-configuration',
  'Debug',
  '-destination',
  `id=${target}`,
  '-derivedDataPath',
  path.join(ws, 'ios', 'DerivedData', target),
  '-allowProvisioningUpdates',
  '-allowProvisioningDeviceRegistration',
]
