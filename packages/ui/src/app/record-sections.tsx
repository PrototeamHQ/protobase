import { Skeleton } from '../primitives/skeleton'
import { lazyComponent } from './lazy-component'

// The record page's sections that draw with code of their own, such as the lines' dragging and the conversation's
// composer, load with the first record that shows one.

export const RecordLines = lazyComponent(() => import('./record-lines').then((module) => module.RecordLines), () => <Skeleton className="h-32 w-full rounded-lg" />)
export const ComposerSection = lazyComponent(() => import('./conversation/composer-section').then((module) => module.ComposerSection), () => <Skeleton className="h-24 w-full rounded-lg" />)
