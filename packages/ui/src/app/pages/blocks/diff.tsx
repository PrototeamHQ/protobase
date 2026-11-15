import type { DiffProps } from '@protobase/layout'
import { DiffView } from '../../../diff-view/diff-view'
import { parsePatch } from '../../../diff-view/patch'
import { cn } from '../../../lib/cn'
import { Skeleton } from '../../../primitives/skeleton'
import { useScopedPathValue } from '../use-path-value'
import { propsOf, type BlockProps } from './block-props'

/** A stored unified patch, each file drawn by `DiffView`; text that is no patch as it is, `emptyText` for an empty field. */
export const DiffBlock = ({ node, className }: BlockProps) => {
  const { source, emptyText } = propsOf<DiffProps>(node)
  const read = useScopedPathValue(source)
  if (read.state === 'missing') return null
  if (read.state === 'loading') return <Skeleton className={cn('h-24 w-full', className)} />
  if (read.value === null || read.value === undefined || read.value === '') return emptyText ? <p className={cn('text-sm text-muted-foreground', className)}>{emptyText}</p> : null
  const text = String(read.value)
  const files = parsePatch(text)
  if (!files) return <pre className={cn('overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-3 font-mono text-[0.6875rem] leading-[18px]', className)}>{text}</pre>
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {files.map((file, index) => (
        <DiffView key={`${index}-${file.path}`} source={file.lines} path={file.path} split className="rounded-md border border-border" />
      ))}
    </div>
  )
}
