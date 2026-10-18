import type { RecordComment } from '@protobase/client'
import type { CommentsSectionModel } from '@protobase/schema'
import { hueOf, initialsOf } from '../../auth/user-to-shell'
import { formatDateTime, formatRelativeTime } from '../../format/date'
import { Avatar } from '../../primitives/avatar'
import { Button } from '../../primitives/button'
import { Skeleton } from '../../primitives/skeleton'
import { Section } from '../../record-view'
import { ErrorBanner } from '../error-banner'
import { CommentBody } from './comment-body'
import { CommentComposer } from './comment-composer'
import { useRecordComments } from './use-record-comments'

const Loading = () => <div className="flex flex-col gap-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-4 w-full" />)}</div>

const Comment = ({ comment }: { comment: RecordComment }) => {
  const author = comment.author.name ?? comment.author.id
  const at = Date.parse(comment.createdAt)
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <Avatar initials={initialsOf(author) || '?'} hue={hueOf(comment.author.id)} size="md" className="ring-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p>
          <span className="font-medium text-foreground">{author}</span>{' '}
          <time dateTime={comment.createdAt} title={formatDateTime(at)} className="text-muted-foreground">
            · {formatRelativeTime(Math.max(0, Math.round((Date.now() - at) / 1000)))}
          </time>
        </p>
        <CommentBody comment={comment} />
      </div>
    </li>
  )
}

/**
 * The record's comments, oldest first with the newest just above the box, and Show earlier comments for those before;
 * `canWrite` false, for a visitor who is not signed in, leaves out the box.
 */
export const CommentsSection = ({ item, resource, recordKey, canWrite }: { item: CommentsSectionModel; resource: string; recordKey: string; canWrite: boolean }) => {
  const comments = useRecordComments(resource, recordKey)
  return (
    <Section title={item.title}>
      {comments.isPending ? (
        <Loading />
      ) : comments.error ? (
        <ErrorBanner title="Could not load the comments" error={comments.error} />
      ) : (
        <>
          {comments.hasNextPage && (
            <Button size="sm" className="mb-4" disabled={comments.isFetchingNextPage} onClick={() => void comments.fetchNextPage()}>
              Show earlier comments
            </Button>
          )}
          {comments.items.length === 0 ? (
            <p className="text-muted-foreground">No comments yet.</p>
          ) : (
            <ol className="divide-y divide-border">
              {comments.items.map((comment) => <Comment key={comment.id} comment={comment} />)}
            </ol>
          )}
        </>
      )}
      {canWrite && (
        <div className="mt-4">
          <CommentComposer resource={resource} recordKey={recordKey} />
        </div>
      )}
    </Section>
  )
}
