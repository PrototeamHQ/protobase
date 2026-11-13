import { densityScales } from './android-app-icon'
import type { Sharp } from './icon-sharp'
import type { NativeFile } from './native-file'

const res = 'app/src/main/res'

// The splash icon's side without an icon background, and the circle in its middle Android shows of it, in dp.
const side = 288
const shown = 192

/** The splash image's drawable, which the launch theme names. */
export const androidSplashImageName = 'protobase_splash_image'

/**
 * The splash for the splash screen plugin to show while the app reloads into a live update, as Android 12 and the
 * core-splashscreen library draw the launch: the image at 288dp, masked to its middle 192dp circle by a ring in the
 * background's colour, on that background.
 */
export const androidSplashImageDrawable = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:gravity="fill">
        <color android:color="@color/protobase_splash_background" />
    </item>
    <item
        android:width="${side}dp"
        android:height="${side}dp"
        android:drawable="@drawable/${androidSplashImageName}"
        android:gravity="center" />
    <item
        android:width="408dp"
        android:height="408dp"
        android:gravity="center">
        <shape android:shape="oval">
            <solid android:color="@android:color/transparent" />
            <stroke
                android:width="108dp"
                android:color="@color/protobase_splash_background" />
        </shape>
    </item>
</layer-list>
`

/**
 * The app's own Android splash image at each density, 288dp, its dark one under `night` beside it when there is one,
 * and the drawable the splash screen plugin shows.
 */
export const androidSplashImage = async (sharp: Sharp, light: Buffer, dark?: Buffer): Promise<NativeFile[]> => {
  const files: NativeFile[] = [{ file: `${res}/drawable/protobase_splash.xml`, content: androidSplashImageDrawable }]
  for (const [density, scale] of Object.entries(densityScales)) {
    const px = side * scale
    files.push({ file: `${res}/drawable-${density}/${androidSplashImageName}.png`, content: await sharp(light).resize(px, px).png().toBuffer() })
    if (dark) files.push({ file: `${res}/drawable-night-${density}/${androidSplashImageName}.png`, content: await sharp(dark).resize(px, px).png().toBuffer() })
  }
  return files
}

/** The side of the splash image, in pixels, it is drawn from: 288dp at Android's largest density. */
export const splashSourceSize = side * densityScales.xxxhdpi

/** The share of the splash image's side Android shows, in its middle. */
export const shownShare = shown / side
