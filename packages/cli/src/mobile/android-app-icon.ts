import type { IconSource } from './icon-source'
import type { Sharp } from './icon-sharp'
import type { NativeFile } from './native-file'

const res = 'app/src/main/res'

/** Android's densities, by their scale of a dp. */
export const densityScales = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }

// The legacy icon's side, the adaptive icon's layers' side and the safe zone in the middle of them that every mask keeps, in dp.
const legacy = 48
const layer = 108
const safeZone = 66

/** The adaptive icons of the template, which the monochrome layer joins. */
export const adaptiveIconFiles = [`${res}/mipmap-anydpi-v26/ic_launcher.xml`, `${res}/mipmap-anydpi-v26/ic_launcher_round.xml`]

/** The template's adaptive icon with a monochrome layer, which Android tints for themed icons. */
export const themedAdaptiveIcon = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`

/** The adaptive icon's background colour resource. */
export const launcherBackground = (color: string) => `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${color.toUpperCase()}</color>
</resources>
`

const circleMask = (size: number) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`)

const transparent = { r: 0, g: 0, b: 0, alpha: 0 }

/**
 * The app's own Android icon at each density: the legacy icon flattened onto `background` and its round one, and the
 * adaptive icon's foreground, the source scaled into the safe zone, with `background` as its background colour. A source with transparency also
 * gets the monochrome layer, the foreground, whose shape Android tints; an opaque one would be a plain square, so it
 * gets none and Android shows the icon as it is.
 */
export const androidAppIcon = async (sharp: Sharp, { image, opaque }: IconSource, background: string): Promise<NativeFile[]> => {
  const files: NativeFile[] = [{ file: `${res}/values/ic_launcher_background.xml`, content: launcherBackground(background) }]
  for (const [density, scale] of Object.entries(densityScales)) {
    const dir = `${res}/mipmap-${density}`
    const side = legacy * scale
    const flat = await sharp(image).resize(side, side).flatten({ background }).png().toBuffer()
    const round = await sharp(flat).ensureAlpha().composite([{ input: circleMask(side), blend: 'dest-in' }]).png().toBuffer()
    const outer = layer * scale
    const inner = Math.round(safeZone * scale)
    const before = Math.floor((outer - inner) / 2)
    const after = outer - inner - before
    const foreground = await sharp(image).resize(inner, inner).extend({ top: before, bottom: after, left: before, right: after, background: transparent }).png().toBuffer()
    files.push({ file: `${dir}/ic_launcher.png`, content: flat }, { file: `${dir}/ic_launcher_round.png`, content: round }, { file: `${dir}/ic_launcher_foreground.png`, content: foreground })
    if (!opaque) files.push({ file: `${dir}/ic_launcher_monochrome.png`, content: foreground })
  }
  if (opaque) return files
  return [...files, ...adaptiveIconFiles.map((file) => ({ file, content: themedAdaptiveIcon }))]
}
