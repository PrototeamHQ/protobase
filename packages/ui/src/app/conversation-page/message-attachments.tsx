import { FileText } from 'lucide-react'
import { formatSize } from '../../live/file-values'
import { buttonClass } from '../../primitives/button'
import { isPreviewed, type Attachment } from './attachments'
import { text } from './messages'

/** The tallest an image preview is drawn, in CSS pixels; a wider one is scaled down to the message's width. */
export const previewHeight = 240

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
 * A message's files under its text: an image as a preview at most `previewHeight` high, a link that opens it in a new
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
            style={{ maxHeight: previewHeight }}
            className="h-auto w-auto max-w-full rounded-md border border-border object-contain"
          />
        </a>
      ) : (
        <FileDownload key={String(attachment.key)} attachment={attachment} />
      ),
    )}
  </div>
)
