import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { nativeIconFiles, protobaseIconDir } from './native-icon'
import type { Platform } from './platform'

const write = (file: string, content: string) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

/** For tests: the icon files of an installed @protobase/mobile in the workspace `ws`, each holding `protobase`. */
export const writeProtobaseIcon = (ws: string) => {
  for (const platform of Object.keys(nativeIconFiles) as Platform[]) {
    for (const file of nativeIconFiles[platform]) write(path.join(protobaseIconDir(ws, platform), file), 'protobase')
  }
}

/** For tests: the icon files `cap add` writes in the platform's native project, each holding `capacitor`. */
export const writeTemplateIcon = (ws: string, platform: Platform) => {
  for (const file of nativeIconFiles[platform]) write(path.join(ws, platform, file), 'capacitor')
}
