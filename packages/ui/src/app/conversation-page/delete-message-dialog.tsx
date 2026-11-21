import { Button } from '../../primitives/button'
import { ResponsiveDialog } from '../../primitives/responsive-dialog'
import { text } from './messages'

/** Asks before a message is deleted, since it goes for everyone in the conversation. */
export const DeleteMessageDialog = ({ onDelete, onClose }: { onDelete: () => void; onClose: () => void }) => (
  <ResponsiveDialog
    open
    title={text('deleteTitle')}
    description={text('deleteDescription')}
    onClose={onClose}
    actions={
      <>
        <Button onClick={onClose}>{text('cancel')}</Button>
        <Button variant="danger" onClick={onDelete}>
          {text('delete')}
        </Button>
      </>
    }
  />
)
