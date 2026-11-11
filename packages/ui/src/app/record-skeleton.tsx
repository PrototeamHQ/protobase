import { Skeleton } from '../primitives/skeleton'
import { text } from './messages'

const rows = [32, 24, 40, 28, 20]

/**
 * A record page while its record loads: its title and a section of field rows where the record page draws them, in the
 * same padding and width, so the loaded page takes their place instead of pushing in.
 */
export const RecordSkeleton = () => (
  <div role="status" aria-label={text('loading')} className="mx-auto w-full max-w-[1100px] px-4 pb-8 pt-6 md:px-10 md:py-8">
    <Skeleton className="h-8 w-3/4 max-w-96" />
    <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_300px] md:gap-12">
      <div>
        <Skeleton className="h-5 w-32" />
        <div className="mt-5 divide-y divide-border border-t">
          {rows.map((width, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-4 py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4" style={{ width: `${width * 2}%` }} />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-40 rounded-lg max-md:hidden" />
    </div>
  </div>
)
