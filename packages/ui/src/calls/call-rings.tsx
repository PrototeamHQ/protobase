import { useEffect, useRef } from 'react'
import { useAppAddress } from '../app/use-app-address'
import { useToast } from '../toasts'
import { text } from './messages'
import type { ShownRing } from './ringing'
import { useRingTone } from './ring-tone'
import { useRings } from './use-rings'

/** A ring as a sticky toast: Decline, and Accept, a link to the record's page that joins its call on this device. */
const ringToast = (ring: ShownRing, accept: { href: string; onNavigate: (href: string) => void }, decline: (call: string) => void) => ({
  state: 'call' as const,
  sticky: true,
  title: ring.title,
  ...(ring.body !== null && { description: ring.body }),
  actions: [
    { label: text('decline'), onClick: () => decline(ring.call) },
    { label: text('accept'), ...accept },
  ],
})

/**
 * Rings the signed-in user on whatever page of the app they have open, over the live stream the page already holds:
 * each call ringing them is a toast with Decline and Accept, with a ring tone, until they answer, here or on another
 * device, decline, or the call ends or stops ringing. Accept opens the record's page, which joins the call after the
 * click on this device only. Someone on do not disturb is not rung; the call is in their bell.
 */
export const CallRings = () => {
  const { ringing, decline, hide } = useRings(true)
  const toast = useToast()
  const { href, open } = useAppAddress()
  const shown = useRef(new Map<string, number>())
  useRingTone(ringing.length > 0)

  useEffect(() => {
    const now = new Set(ringing.map((ring) => ring.call))
    for (const [call, id] of shown.current) {
      if (now.has(call)) continue
      toast.dismiss(id)
      shown.current.delete(call)
    }
    for (const ring of ringing) {
      if (shown.current.has(ring.call)) continue
      const accept = {
        href: href({ kind: 'record', resource: ring.resource, key: ring.key, call: 'join' }),
        onNavigate: (target: string) => {
          hide(ring.call)
          open(target)
        },
      }
      shown.current.set(ring.call, toast.show({ ...ringToast(ring, accept, decline), onClose: () => decline(ring.call) }))
    }
  }, [ringing, toast, href, open, decline, hide])

  useEffect(() => {
    const own = shown.current
    return () => {
      for (const id of own.values()) toast.dismiss(id)
      own.clear()
    }
  }, [toast])

  return null
}
