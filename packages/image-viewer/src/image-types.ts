/**
 * The image types the viewer opens: the raster images browsers draw that downloads serve inline. SVG is left out, as
 * downloads serve it as an attachment, and so are HEIC and TIFF, which most browsers cannot draw.
 */
export const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp'] as const
