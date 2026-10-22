import type { CardsLayout, CardWidth, RecordCardsProps } from './blocks'

/** How a `RecordCards` lays out its cards, its props' defaults filled in: stacked, and two thirds wide in a carousel. */
export const cardsLayoutOf = ({ layout, cardWidth }: Pick<RecordCardsProps, 'layout' | 'cardWidth'>): { layout: CardsLayout; cardWidth: CardWidth } => ({
  layout: layout ?? 'stack',
  cardWidth: cardWidth ?? '2/3',
})
