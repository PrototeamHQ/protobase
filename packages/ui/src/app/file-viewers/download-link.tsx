import { Download } from 'lucide-react'
import { cn } from '../../lib/cn'
import { buttonClass } from '../../primitives/button'
import type { ViewedFile } from './file-viewer'
import { text } from './messages'

/** The button that downloads a viewed file. */
export const DownloadLink = ({ file, className }: { file: ViewedFile; className?: string }) => (
  <a href={file.url} download={file.name} className={cn(buttonClass({ size: 'sm' }), 'gap-1.5', className)}>
    <Download className="size-4" aria-hidden="true" />
    {text('download')}
  </a>
)
