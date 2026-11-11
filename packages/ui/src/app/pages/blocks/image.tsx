import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { ImageProps } from '@protobase/layout'
import { useClient } from '../../../data/api-provider'
import { keys } from '../../../data/query-keys'
import { useElementWidth } from '../../../focus-page/use-element-width'
import { Skeleton } from '../../../primitives/skeleton'
import { useTheme } from '../../../theme/theme-provider'
import { propsOf, type BlockProps } from './block-props'
import { imageQuery, imageRefetch } from './image-query'

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

/**
 * The picture an API function draws, fetched with the reader's token at the block's size, or the width it has, and the
 * page's theme, again every `refresh` seconds. The previous picture stays while the next loads. A function that refuses
 * or answers no picture, also on a later request, leaves its `alt`, or nothing.
 */
export const ImageBlock = ({ node }: BlockProps) => {
  const { function: name, alt, width, height, refresh } = propsOf<ImageProps>(node)
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
      const answer = await client.invoke(name, { query })
      if (!(answer instanceof Blob)) throw new Error(`The function "${name}" answered no picture`)
      return answer
    },
  })
  const url = useObjectUrl(picture.data)
  const size = { ...(width !== undefined && { width }), ...(height !== undefined && { height }) }
  return (
    <div ref={ref} className="min-w-0">
      {picture.isError ? (
        alt && <p className="text-muted-foreground">{alt}</p>
      ) : url ? (
        <img src={url} alt={alt ?? ''} style={size} className={width === undefined ? 'w-full max-w-full object-contain' : 'max-w-full object-contain'} />
      ) : (
        <Skeleton className="w-full max-w-full" style={{ height: height ?? 160, ...(width !== undefined && { width }) }} />
      )}
    </div>
  )
}
