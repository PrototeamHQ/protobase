import { existsSync } from 'node:fs'
import path from 'node:path'
import { pngIcons } from '@protobase/schema/png-icons'
import { faviconFile } from './favicon-file'

/** The path browsers and favicon services ask a site's icon at when its page names none, such as before they load it. */
export const faviconIcoPath = '/favicon.ico'

// A PNG first, which every client draws, the smallest first; the SVG, which a bundle always has, last.
const candidates = [pngIcons.icon192.file, pngIcons.appleTouch.file, pngIcons.icon512.file, faviconFile]

/**
 * The file in `dir` that `/favicon.ico` answers with: the app's icon as a PNG when it has one, else its favicon. The
 * response names the file's own type, PNG or SVG, which clients follow over the `.ico` in the path.
 */
export const faviconIcoFile = (dir: string) => candidates.map((file) => path.join(dir, file)).find((file) => existsSync(file))
