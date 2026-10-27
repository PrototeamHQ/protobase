import type { Icon } from '@modelcontextprotocol/server'
import { pngIcons, type AppIcons, type PngIcon } from './app-icons'
import { faviconPath } from './web-manifest'

// The PNGs a client may draw beside the server's name; the maskable one is cropped to a launcher's shape.
const listed: PngIcon[] = ['icon192', 'appleTouch', 'icon512']

/**
 * The icons the app's MCP server names to clients (`serverInfo.icons`), on the app's origin `origin`: the project's
 * PNGs first, which every client draws, then its favicon, which the app always answers.
 */
export const mcpIcons = (origin: string, icons?: AppIcons): Icon[] => [
  ...listed.filter((icon) => icons?.png.includes(icon)).map((icon) => {
    const { file, size } = pngIcons[icon]
    return { src: new URL(`/${file}`, origin).href, mimeType: 'image/png', sizes: [`${size}x${size}`] }
  }),
  { src: new URL(faviconPath, origin).href, mimeType: 'image/svg+xml', sizes: ['any'] },
]
