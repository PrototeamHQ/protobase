import { FileText } from 'lucide-react'
import { formatSize } from '../../live/file-values'
import { cn } from '../../lib/cn'
import { buttonClass } from '../../primitives/button'
import { isPreviewed, type Attachment } from './attachments'
import { text } from './messages'

/** The tallest an image preview is drawn, in CSS pixels; a wider one is scaled down to the message's width. */
export const previewHeight = 240

// An image of known size takes its drawn width and shape before it loads, so nothing under it moves when it arrives;
// at most `previewHeight` high, and narrower as the message is, keeping its shape
const previewSize = ({ width, height }: Attachment) =>
  width === undefined || height === undefined || width <= 0 || height <= 0
    ? { className: 'w-auto', style: { maxHeight: previewHeight } }
    : { className: '', style: { maxHeight: previewHeight, width: Math.round(width * Math.min(1, previewHeight / height)), aspectRatio: `${width} / ${height}` } }

const FileLabel = ({ attachment }: { attachment: Attachment }) => (
  <>
    <FileText className="size-4" />
    <span className="max-w-64 truncate">{attachment.name}</span>
    {attachment.size !== undefined && <span className="text-muted-foreground">{formatSize(attachment.size)}</span>}
  </>
)

const FileDownload = ({ attachment }: { attachment: Attachment }) => {
  const className = buttonClass({ variant: 'secondary', size: 'sm' })
  if (attachment.url === undefined) {
    return (
      <span className={className} aria-disabled title={text('fileMissing')}>
        <FileLabel attachment={attachment} />
      </span>
    )
  }
  return (
    <a href={attachment.url} download={attachment.name} className={className}>
      <FileLabel attachment={attachment} />
    </a>
  )
}

/**
 * A message's files under its text: an image as a preview at most `previewHeight` high, taking its room before it loads
 * when its size is known, a link that opens it in a new
 * tab, any other file as a link with its name and size that downloads it. The links are those the API signs for the
 * reader.
 */
export const MessageAttachments = ({ attachments }: { attachments: readonly Attachment[] }) => (
  <div className="flex flex-wrap items-start gap-2">
    {attachments.map((attachment) =>
      isPreviewed(attachment) ? (
        <a key={String(attachment.key)} href={attachment.url} target="_blank" rel="noreferrer" title={attachment.name} className="max-w-full">
          <img
            src={attachment.url}
            alt={attachment.name}
            width={attachment.width}
            height={attachment.height}
            style={previewSize(attachment).style}
            className={cn('h-auto max-w-full rounded-md border border-border object-contain', previewSize(attachment).className)}
          />
        </a>
      ) : (
        <FileDownload key={String(attachment.key)} attachment={attachment} />
      ),
    )}
  </div>
)
