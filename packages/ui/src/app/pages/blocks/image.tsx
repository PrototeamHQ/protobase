import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { ImageProps } from '@protobase/layout'
import { useClient } from '../../../data/api-provider'
import { keys } from '../../../data/query-keys'
import { useElementWidth } from '../../../focus-page/use-element-width'
import { Skeleton } from '../../../primitives/skeleton'
import { useTheme } from '../../../theme/theme-provider'
import { cn } from '../../../lib/cn'
import { propsOf, type BlockProps } from './block-props'
import { FixedImage } from './fixed-image'
import { imageQuery, imageRefetch, isPicture } from './image-query'

/** A URL the `<img>` loads a fetched picture from, given back to the browser once another replaces it or the block goes. */
const useObjectUrl = (blob: Blob | undefined) => {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return setUrl(undefined)
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

/** Whether the browser failed to draw the picture at `url`, such as a damaged file; a new `url` is tried again. */
const useBroken = (url: string | undefined) => {
  const [broken, setBroken] = useState<string>()
  return [broken !== undefined && broken === url, () => setBroken(url)] as const
}

/**
 * The picture an API function draws, fetched with the reader's token at the block's size, or the width it has, and the
 * page's theme, again every `refresh` seconds. The previous picture stays while the next loads. A function that refuses
 * or answers no picture, also on a later request, or a picture the browser cannot draw, leaves its `alt`, or nothing.
 */
const FunctionImage = ({ name, alt, width, height, refresh, className }: { name: string; alt?: string; width?: number; height?: number; refresh?: number; className?: string }) => {
  const client = useClient()
  const { theme } = useTheme()
  const [ref, space] = useElementWidth()
  const query = imageQuery({ width, height, space, theme })
  const picture = useQuery({
    queryKey: keys.image(name, query ?? {}),
    enabled: query !== undefined,
    placeholderData: keepPreviousData,
    ...imageRefetch(refresh),
    queryFn: async () => {
      // The picture is the caller's own: the browser's HTTP cache keeps it from no later user of the browser.
      const answer = await client.invoke(name, { query, cache: 'no-store' })
      if (!isPicture(answer)) throw new Error(`The function "${name}" answered no picture`)
      return answer
    },
  })
  const url = useObjectUrl(picture.data)
  const [broken, markBroken] = useBroken(url)
  const size = { ...(width !== undefined && { width }), ...(height !== undefined && { height }) }
  return (
    <div ref={ref} className={cn('min-w-0', className)}>
      {picture.isError || broken ? (
        alt && <p className="text-muted-foreground">{alt}</p>
      ) : url ? (
        <img src={url} alt={alt ?? ''} onError={markBroken} style={size} className={width === undefined ? 'w-full max-w-full object-contain' : 'max-w-full object-contain'} />
      ) : (
        <Skeleton className="w-full max-w-full" style={{ height: height ?? 160, ...(width !== undefined && { width }) }} />
      )}
    </div>
  )
}

/** A fixed picture at `src`, or the one an API function draws. */
export const ImageBlock = ({ node, className }: BlockProps) => {
  const props = propsOf<ImageProps>(node)
  if (props.src !== undefined) return <FixedImage src={props.src} alt={props.alt} width={props.width} height={props.height} className={className} />
  return <FunctionImage name={props.function} alt={props.alt} width={props.width} height={props.height} refresh={props.refresh} className={className} />
}
