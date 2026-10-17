import { useAdminMeta } from '../meta-gate'
import type { CardDotsLine } from './card-dots-lines'
import { DotsRoom, RelatedDots, type DotCardComponent } from './related-dots'

const lines = 'flex flex-col gap-1.5'

/** The room a card's lines of dots take at its bottom, inside its link, which the dots are drawn over. */
export const CardDotsRoom = ({ dots }: { dots: CardDotsLine[] }) => (
  <span className={lines}>
    {dots.map(({ column, records }) => (
      <DotsRoom key={column.name} count={records.length} />
    ))}
  </span>
)

/**
 * A card's lines of dots, over the room its link holds for them at its bottom, inside its border and padding: beside
 * the link in the document, so a dot is a link of its own and the pointer between the dots reaches the card's.
 * The card's list item must be `relative`.
 */
export const CardDots = ({ dots, Card }: { dots: CardDotsLine[]; Card: DotCardComponent }) => {
  const { resources, views } = useAdminMeta()
  return (
    <div className={`pointer-events-none absolute inset-x-[calc(0.75rem+1px)] bottom-[calc(0.75rem+1px)] ${lines}`}>
      {dots.map(({ column, records }) => {
        const target = resources[column.resource]
        return target && <RelatedDots key={column.name} column={column} records={records} target={target} view={views[target.name]} Card={Card} wrap />
      })}
    </div>
  )
}
