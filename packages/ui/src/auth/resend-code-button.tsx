import { useEffect, useState } from 'react'
import { Button } from '../primitives/button'
import { text } from './messages'

export type ResendCodeButtonProps = {
  /** Sends a new code; the button waits `cooldown` seconds again after it. */
  onResend: () => void
  /** Seconds to wait after a code went out before another is asked for; 30 by default. */
  cooldown?: number
  disabled?: boolean
}

/** "Send a new code", counting down first: the screen opens right after a code went out, and so does every resend. */
export const ResendCodeButton = ({ onResend, cooldown = 30, disabled }: ResendCodeButtonProps) => {
  const [until, setUntil] = useState(() => Date.now() + cooldown * 1000)
  const [now, setNow] = useState(() => Date.now())
  const left = Math.max(0, Math.ceil((until - now) / 1000))

  useEffect(() => {
    if (left === 0) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [left])

  return (
    <Button
      variant="ghost"
      disabled={disabled || left > 0}
      onClick={() => {
        const sent = Date.now()
        setUntil(sent + cooldown * 1000)
        setNow(sent)
        onResend()
      }}
      className="min-h-10"
    >
      {left > 0 ? text('sendNewCodeIn', left) : text('sendNewCode')}
    </Button>
  )
}
