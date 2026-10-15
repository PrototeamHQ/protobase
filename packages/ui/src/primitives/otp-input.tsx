import { useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type MouseEvent, type Ref } from 'react'
import { cn } from '../lib/cn'
import { editedCode, pastedCode } from './otp-value'

export type OtpInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'type' | 'inputMode' | 'autoComplete' | 'maxLength' | 'pattern' | 'size'> & {
  /** The digits entered so far. */
  value: string
  onChange: (code: string) => void
  /** Called with the code once its last digit is in, typed, pasted or filled in by the system, to submit it at once. */
  onComplete?: (code: string) => void
  /** How many digits the code has; 6 by default. */
  length?: number
  invalid?: boolean
  ref?: Ref<HTMLInputElement>
}

/**
 * A one-time code field drawn as a box per digit: one real input, so the system's code autofill (`one-time-code`, from
 * a mail or a text message), pasting a whole code into any box, the phone's digit keyboard and a form's `required`
 * work as on any field. Arrow keys, Home and End move between boxes, and a digit typed on a filled box replaces it.
 * Label it as any input, with a `<label>` around it or `aria-label`.
 */
export const OtpInput = ({ value, onChange, onComplete, length = 6, invalid, disabled, className, ref, onFocus, onBlur, onSelect, onKeyDown, onClick, onPaste, ...rest }: OtpInputProps) => {
  const input = useRef<HTMLInputElement | null>(null)
  const [focused, setFocused] = useState(false)
  const [caret, setCaret] = useState(value.length)
  const code = value.slice(0, length)
  const active = Math.min(caret, length - 1)

  const attach = (node: HTMLInputElement | null) => {
    input.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }

  const commit = (next: string) => {
    if (next === code) return
    onChange(next)
    if (next.length === length) onComplete?.(next)
  }

  // A box of a digit is selected, so typing replaces it; past the last digit the caret waits for the next one.
  const place = (at: number) => {
    const field = input.current
    if (!field) return
    const to = Math.max(0, Math.min(at, code.length))
    field.setSelectionRange(to, to < code.length ? to + 1 : to)
    setCaret(to)
  }

  const moveWithKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return
    const at = event.currentTarget.selectionStart ?? code.length
    const moves: Record<string, number> = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: code.length }
    const target = moves[event.key]
    if (target === undefined) return
    event.preventDefault()
    place(target)
  }

  // The text under the boxes is invisible, so a click picks the box under the pointer. A click from elsewhere, such as
  // a label's, leaves the caret where it is.
  const placeAtPointer = (event: MouseEvent<HTMLInputElement>) => {
    onClick?.(event)
    const box = event.currentTarget.getBoundingClientRect()
    if (event.clientX <= box.left || event.clientX >= box.right) return
    place(Math.floor(((event.clientX - box.left) / box.width) * length))
  }

  return (
    <div className={cn('relative', disabled && 'opacity-50', className)}>
      <div aria-hidden className="flex justify-center gap-2">
        {Array.from({ length }, (_, index) => {
          const current = focused && index === active
          return (
            // The digit is drawn from `data-digit`, so it is no text of a `<label>` around the field.
            <div
              key={index}
              data-slot={index}
              data-digit={code[index]}
              className={cn(
                'flex h-12 min-w-0 max-w-12 flex-1 items-center justify-center rounded-md border bg-background font-mono text-xl font-semibold text-foreground shadow-sm transition-colors before:content-[attr(data-digit)]',
                invalid ? 'border-danger' : current ? 'border-primary' : 'border-border-strong',
                current && (invalid ? 'ring-2 ring-danger/20' : 'ring-2 ring-primary/20'),
              )}
            >
              {code[index] === undefined && (current ? <span className="h-6 w-px animate-pulse bg-foreground" /> : <span className="size-1.5 rounded-full bg-border-strong" />)}
            </div>
          )
        })}
      </div>
      <input
        ref={attach}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern={`[0-9]{${length}}`}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        aria-invalid={invalid || undefined}
        disabled={disabled}
        value={code}
        className="absolute inset-0 size-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent disabled:cursor-not-allowed"
        {...rest}
        onChange={(event) => {
          // Typed and suggested text comes as `data`, the system's replacement of the text as `dataTransfer`.
          const { data, dataTransfer } = event.nativeEvent as InputEvent
          commit(editedCode(event.target.value, data ?? dataTransfer?.getData('text/plain'), length))
        }}
        onPaste={(event) => {
          onPaste?.(event)
          if (event.defaultPrevented) return
          event.preventDefault()
          const field = event.currentTarget
          const next = pastedCode(code, event.clipboardData.getData('text'), field.selectionStart ?? code.length, length)
          commit(next)
          setCaret(next.length)
        }}
        onSelect={(event) => {
          onSelect?.(event)
          const field = event.currentTarget
          const start = field.selectionStart ?? code.length
          if (start === field.selectionEnd && start < field.value.length) field.setSelectionRange(start, start + 1)
          setCaret(start)
        }}
        onKeyDown={moveWithKeys}
        onClick={placeAtPointer}
        onFocus={(event) => {
          setFocused(true)
          onFocus?.(event)
        }}
        onBlur={(event) => {
          setFocused(false)
          onBlur?.(event)
        }}
      />
    </div>
  )
}
