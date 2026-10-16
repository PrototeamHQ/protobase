import { lazy, Suspense } from 'react'
import { cn } from '../lib/cn'
import type { MarkdownContentProps } from './markdown-content'

// marked and DOMPurify load with the first markdown shown, so an app without a markdown field never loads them.
const MarkdownContent = lazy(() => import('./markdown-content').then((module) => ({ default: module.MarkdownContent })))

/** Markdown rendered and sanitised; its source, line breaks kept, until the renderer has loaded. */
export const Markdown = (props: MarkdownContentProps) => (
  <Suspense fallback={<div className={cn('whitespace-pre-line break-words', props.className)}>{props.source}</div>}>
    <MarkdownContent {...props} />
  </Suspense>
)
