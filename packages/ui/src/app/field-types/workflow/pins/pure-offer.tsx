import { Button } from '../../../../primitives/button'
import { text } from '../messages'

/** Where a wire from an object pin was let go on the empty canvas, and the Break or Make that pin can have. */
export type PureOffer = { x: number; y: number; label: string; add: () => void }

/** The offer of a Break or a Make for the pin a wire was dragged from, at the point it was let go. */
export const PureOfferMenu = ({ offer, onClose }: { offer: PureOffer; onClose: () => void }) => (
  <div role="dialog" aria-label={text('pureOfferTitle')} className="absolute z-10 grid gap-1 rounded-md border bg-background p-1 shadow-md" style={{ left: offer.x, top: offer.y }}>
    <Button
      size="sm"
      variant="ghost"
      autoFocus
      onClick={() => {
        offer.add()
        onClose()
      }}
    >
      {offer.label}
    </Button>
    <Button size="sm" variant="ghost" onClick={onClose}>
      {text('pureOfferClose')}
    </Button>
  </div>
)
