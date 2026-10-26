import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pngIcons } from '@protobase/schema/png-icons'
import type { Plugin } from 'vite'
import { faviconFile, projectFavicon } from '../build/favicon'

/**
 * Links the project's favicon at `/protobase.favicon.svg` in the app's page, and its Apple touch icon at
 * `/protobase.apple-touch-icon.png`, which Safari takes for the home screen as it takes no SVG. A bundle always has
 * the favicon (see `buildFavicon`) and the touch icon when the project has one (see `buildIcons`); without it Safari
 * shows a picture of the page instead. The dev server answers them from the project's files, the favicon Protobase's
 * without one, and the project's other PNG icons the same way.
 */
export const faviconLink = (projectDir?: string): Plugin => {
  let base = '/'
  return {
    name: 'protobase-favicon-link',
    configResolved: (config) => {
      base = config.base
    },
    configureServer: (server) => {
      server.middlewares.use(`/${faviconFile}`, (_request, response, next) => {
        readFile(projectFavicon(projectDir)).then((body) => {
          response.setHeader('content-type', 'image/svg+xml')
          response.setHeader('cache-control', 'no-cache')
          response.end(body)
        }, next)
      })
      for (const { file } of Object.values(pngIcons)) {
        server.middlewares.use(`/${file}`, (_request, response, next) => {
          const own = projectDir === undefined ? undefined : path.join(projectDir, file)
          if (!own || !existsSync(own)) return next()
          readFile(own).then((body) => {
            response.setHeader('content-type', 'image/png')
            response.setHeader('cache-control', 'no-cache')
            response.end(body)
          }, next)
        })
      }
    },
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        { tag: 'link', attrs: { rel: 'icon', type: 'image/svg+xml', href: `${base}${faviconFile}` }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: `${base}${pngIcons.appleTouch.file}` }, injectTo: 'head' },
      ],
    },
  }
}
