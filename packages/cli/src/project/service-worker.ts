import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'
import { faviconFile } from '../build/favicon'
import { serviceWorkerCode, serviceWorkerFile } from '../build/service-worker-code'
import { themeFile } from '../build/theme'

// The assets a built index.html links or loads by their absolute URL, such as /assets/index-abc123.js.
const linkedAssets = (html: string) => [...new Set([...html.matchAll(/["'](\/assets\/[^"']+)["']/g)].map((match) => match[1]!))]

/**
 * Gives a production build of the app its service worker (see `serviceWorkerCode`) at `/protobase.sw.js`, which the
 * page registers. The worker's version hashes the build's file names, which hash their contents.
 */
export const serviceWorker = (): Plugin => ({
  name: 'protobase-service-worker',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    // Inside a mobile app (Capacitor defines `window.Capacitor` before the page's scripts) the files are on the device.
    handler: () => [{ tag: 'script', children: `if ('serviceWorker' in navigator && !window.Capacitor) navigator.serviceWorker.register('/${serviceWorkerFile}')`, injectTo: 'body' }],
  },
  generateBundle: {
    order: 'post',
    handler(_options, bundle) {
      const page = bundle['index.html']
      if (page?.type !== 'asset') throw new Error('The app build has no index.html to give a service worker')
      const version = createHash('sha256').update(Object.keys(bundle).sort().join('\n')).digest('hex').slice(0, 16)
      const precache = ['/index.html', ...linkedAssets(String(page.source)), `/${themeFile}`, `/${faviconFile}`]
      this.emitFile({ type: 'asset', fileName: serviceWorkerFile, source: serviceWorkerCode({ version, precache }) })
    },
  },
})
