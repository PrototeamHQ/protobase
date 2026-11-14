import type { CSSProperties } from 'react'
import { Input } from '../../../primitives/input'

// csstype has no key for it; every current browser engine draws it.
const masked: CSSProperties & { WebkitTextSecurity: 'disc' } = { WebkitTextSecurity: 'disc' }

type SecretInputProps = { name: string; value: string; invalid: boolean; onChange: (value: string) => void }

/**
 * A secret input's field. Not a password input: browsers offer to save the value of any password input, and some to
 * generate one. Instead a text input drawn as discs, so the value never shows on screen. `autocomplete="off"` keeps it
 * out of the browser's form history and saved session, which keep a text input's value as they never do a password's.
 * Its type never changes at runtime, so no show/hide toggle: a browser may treat an input that was ever a password as
 * one. The data attributes ask password managers and writing assistants, in each one's documented words, to skip the
 * field, and the autocorrect ones keep keyboards out.
 */
export const SecretInput = ({ name, value, invalid, onChange }: SecretInputProps) => (
  <Input
    type="text"
    name={name}
    autoComplete="off"
    style={masked}
    autoCorrect="off"
    autoCapitalize="off"
    spellCheck={false}
    data-1p-ignore
    data-lpignore="true"
    data-bwignore
    data-form-type="other"
    data-gramm="false"
    data-gramm_editor="false"
    data-enable-grammarly="false"
    value={value}
    invalid={invalid}
    onChange={(event) => onChange(event.target.value)}
  />
)
