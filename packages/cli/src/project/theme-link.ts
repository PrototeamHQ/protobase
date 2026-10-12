import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'
import { compileTheme, themeFile, themeTokens } from '../build/theme'

/**
 * Links the project's theme at `/protobase.theme.css` in the app's page, after its own stylesheets, so it themes the
 * sign-in page too. A bundle always has the file (see `buildTheme`); with `projectDir`, the dev server answers it from
 * the project's protobase.theme.css, checked as the build checks it, and empty without one.
 */
export const themeLink = (projectDir?: string): Plugin => {
  let base = '/'
  return {
    name: 'protobase-theme-link',
    configResolved: (config) => {
      base = config.base
    },
    configureServer: (server) => {
      if (projectDir === undefined) return
      server.middlewares.use(`/${themeFile}`, (_request, response, next) => {
        const file = path.join(projectDir, themeFile)
        const css = existsSync(file) ? Promise.all([readFile(file, 'utf8'), themeTokens()]).then(([code, tokens]) => compileTheme(code, themeFile, tokens).css) : Promise.resolve('')
        css.then((body) => {
          response.setHeader('content-type', 'text/css')
          response.setHeader('cache-control', 'no-cache')
          response.end(body)
        }, next)
      })
    },
    transformIndexHtml: {
      order: 'post',
      handler: () => [{ tag: 'link', attrs: { rel: 'stylesheet', href: `${base}${themeFile}` }, injectTo: 'head' }],
    },
  }
}
