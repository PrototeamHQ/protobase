import { Button } from '../../../../primitives/button'
import { text } from '../messages'

/**
 * Where a wire was let go on the empty canvas, and the nodes the pin it came from can have: a Break or a Make for an
 * object pin, the condition nodes for an Only when pin or a side of an And, an Or or a Not.
 */
export type PureOffer = { x: number; y: number; choices: { label: string; add: () => void }[] }

/** The offer of the nodes the pin a wire was dragged from can have, at the point it was let go. */
export const PureOfferMenu = ({ offer, onClose }: { offer: PureOffer; onClose: () => void }) => (
  <div role="dialog" aria-label={text('pureOfferTitle')} className="absolute z-10 grid gap-1 rounded-md border bg-background p-1 shadow-md" style={{ left: offer.x, top: offer.y }}>
    {offer.choices.map((choice, index) => (
      <Button
        key={choice.label}
        size="sm"
        variant="ghost"
        className="justify-start"
        autoFocus={index === 0}
        onClick={() => {
          choice.add()
          onClose()
        }}
      >
        {choice.label}
      </Button>
    ))}
    <Button size="sm" variant="ghost" onClick={onClose}>
      {text('pureOfferClose')}
    </Button>
  </div>
)
