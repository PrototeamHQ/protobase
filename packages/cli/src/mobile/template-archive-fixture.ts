import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Platform } from './platform'

const templates: Record<Platform, string> = { ios: 'ios-spm-template.tar.gz', android: 'android-template.tar.gz' }

const archive = (platform: Platform) => path.join(fileURLToPath(new URL('../../../mobile', import.meta.url)), 'node_modules', '@capacitor', 'cli', 'assets', templates[platform])

/** For tests: the file at `file` of the native project the pinned Capacitor's `cap add` writes, from its template. */
export const templateFile = (platform: Platform, file: string) => execFileSync('tar', ['-xzOf', archive(platform), file])
