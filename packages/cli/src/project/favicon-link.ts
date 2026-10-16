import { readFile } from 'node:fs/promises'
import type { Plugin } from 'vite'
import { faviconFile, projectFavicon } from '../build/favicon'

/**
 * Links the project's favicon at `/protobase.favicon.svg` in the app's page. A bundle always has the file (see
 * `buildFavicon`); the dev server answers it from the project's protobase.favicon.svg, or Protobase's without one.
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
    },
    transformIndexHtml: {
      order: 'post',
      handler: () => [{ tag: 'link', attrs: { rel: 'icon', type: 'image/svg+xml', href: `${base}${faviconFile}` }, injectTo: 'head' }],
    },
  }
}
