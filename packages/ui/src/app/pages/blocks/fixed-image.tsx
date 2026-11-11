/** A fixed picture at `src`, as a plain `<img>` carrying the block's classes, at its `width` and `height` when given. */
export const FixedImage = ({ src, alt, width, height, className }: { src: string; alt?: string; width?: number; height?: number; className?: string }) => (
  <img src={src} alt={alt ?? ''} width={width} height={height} className={className ?? 'max-w-full'} />
)
