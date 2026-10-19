import { Hono } from 'hono'
import { webManifest } from './web-manifest'

/** The path under the system path (`/api`) the admin app's page links its manifest at. */
export const webManifestPath = '/manifest.webmanifest'

/** Answers the web app manifest to anyone: the browser fetches it without the user's token, before they sign in. */
export const webManifestRoute = (appName: string) => {
  const app = new Hono()
  const body = JSON.stringify(webManifest(appName))
  app.get(webManifestPath, () => new Response(body, { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'no-cache' } }))
  return app
}
