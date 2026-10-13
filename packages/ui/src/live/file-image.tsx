import { useMemo, useState } from 'react'
import { thumbHashToDataURL } from 'thumbhash'

// A ThumbHash in base64 drawn as a PNG data URL; `undefined` for text that is no base64.
const placeholderImage = (hash: string) => {
  let binary: string
  try {
    binary = atob(hash)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'InvalidCharacterError') return undefined
    throw error
  }
  return thumbHashToDataURL(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
}

export type FileImageProps = {
  /** What `shownImage` picked: the link to draw and the image's ThumbHash. */
  image: { url: string; placeholder?: string }
  className?: string
  loading?: 'lazy'
}

/** An image of a file, its placeholder drawn blurred behind it until it has loaded. */
export const FileImage = ({ image, className, loading }: FileImageProps) => {
  const [loaded, setLoaded] = useState<string>()
  const placeholder = useMemo(() => (image.placeholder === undefined ? undefined : placeholderImage(image.placeholder)), [image.placeholder])
  const waiting = placeholder !== undefined && loaded !== image.url
  return (
    <img
      src={image.url}
      alt=""
      loading={loading}
      decoding="async"
      onLoad={() => setLoaded(image.url)}
      className={className}
      style={waiting ? { backgroundImage: `url("${placeholder}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    />
  )
}
