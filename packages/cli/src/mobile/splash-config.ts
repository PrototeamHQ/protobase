import type { MobileSplash, MobileSplashLook } from '@protobase/server'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const shape = "such as { image: 'splash.png', background: '#0d9488', dark: { background: '#042f2e' } }"

// One look, `mobile.splash` or `mobile.splash.dark`, checked: an image path and a background, each a non-empty string.
const checkLook = (value: Record<string, unknown>, setting: string): MobileSplashLook => {
  const { image, background } = value
  if (image !== undefined && (typeof image !== 'string' || image === '')) throw new Error(`${setting}.image must be the path of the splash image from the project's folder, such as 'splash.png'`)
  if (background !== undefined && (typeof background !== 'string' || background === '')) throw new Error(`${setting}.background must be a colour, such as '#0d9488'`)
  return { ...(image !== undefined && { image }), ...(background !== undefined && { background }) }
}

/**
 * The `mobile.splash` section, checked for its shape; its colours and image are checked when they are drawn. A dark
 * image needs a light one, since the light launch shows the icon in a layout of its own.
 */
export const checkSplashConfig = (value: unknown): MobileSplash => {
  if (!isRecord(value)) throw new Error(`mobile.splash must be an object, ${shape}`)
  const { dark } = value
  if (dark !== undefined && !isRecord(dark)) throw new Error(`mobile.splash.dark must be an object, ${shape}`)
  const light = checkLook(value, 'mobile.splash')
  if (dark === undefined) return light
  const darkLook = checkLook(dark, 'mobile.splash.dark')
  if (darkLook.image !== undefined && light.image === undefined) throw new Error('mobile.splash.dark.image needs mobile.splash.image: set the light image too')
  return { ...light, dark: darkLook }
}
