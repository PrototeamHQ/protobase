import { useState, type CSSProperties } from 'react'
import { Button, type FileViewerProps } from '@protobase/ui'
import { text } from './texts'

// Inline styles rather than Tailwind classes: an app's build makes utilities only for its own files, not for this
// package's in node_modules. Colors are the app's theme tokens.
const figure: CSSProperties = { margin: 0, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }
const bar: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', color: 'var(--muted-foreground)', fontSize: '0.875rem' }
const fitted: CSSProperties = { display: 'block', margin: '0 auto', maxWidth: '100%', maxHeight: '75dvh', width: 'auto', height: 'auto' }
// At actual size the image may be wider than the page, which does not scroll sideways, so this box scrolls it alone.
const scrollBox: CSSProperties = { overflow: 'auto', maxHeight: '75dvh' }
const actual: CSSProperties = { display: 'block', maxWidth: 'none' }

type Dimensions = { width: number; height: number }

/** An image file drawn to fit the page, or at its actual size; an image the browser cannot draw throws. */
export const ImageView = ({ file }: FileViewerProps) => {
  const [dimensions, setDimensions] = useState<Dimensions>()
  const [failed, setFailed] = useState(false)
  const [atActualSize, setAtActualSize] = useState(false)
  if (failed) throw new Error(`The image ${file.name} could not be drawn`)
  const t = text()
  const image = (
    <img
      src={file.url}
      alt={file.name}
      decoding="async"
      style={atActualSize ? actual : fitted}
      onLoad={(event) => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
      onError={() => setFailed(true)}
    />
  )
  return (
    <figure style={figure}>
      <div style={bar}>
        <span>{dimensions && t.dimensions(dimensions.width, dimensions.height)}</span>
        <Button size="sm" aria-pressed={atActualSize} disabled={!dimensions} onClick={() => setAtActualSize(!atActualSize)}>
          {t.actualSize}
        </Button>
      </div>
      {atActualSize ? <div style={scrollBox}>{image}</div> : image}
    </figure>
  )
}
