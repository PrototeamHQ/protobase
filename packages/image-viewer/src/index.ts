import { definePlugin, type FileViewer } from '@protobase/ui'
import { imageTypes } from './image-types'
import { ImageViewer } from './image-viewer'

export { imageTypes } from './image-types'
export { ImageViewer } from './image-viewer'

const viewer: FileViewer = { component: ImageViewer }

/**
 * The image viewer plugin: an app attaches it with `defineUi({ extends: [imageViewer] })` in its `protobase.ui.tsx`,
 * and a stored PNG, JPEG, GIF, WebP, AVIF or BMP then opens in the app instead of downloading.
 */
export default definePlugin({ name: 'image-viewer', fileViewers: Object.fromEntries(imageTypes.map((type) => [type, viewer])) })
