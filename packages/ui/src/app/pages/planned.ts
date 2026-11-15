import type { RecordPhotos, RelatedLabels } from '@protobase/client'

/**
 * What a block's planned read holds where it draws: its rows, or a count's total, while it loads or once it failed, and
 * the names and photos of its rows when the block asked for them.
 */
export type Planned = { isPending: boolean; error: Error | null; rows: Record<string, unknown>[]; total?: number; labels?: RelatedLabels; photos?: RecordPhotos }
