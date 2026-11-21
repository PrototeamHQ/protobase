import type { FieldModel } from '@protobase/schema'
import { Button } from '../primitives/button'
import { Select } from '../primitives/select'
import { accountPath } from '../account/account-pages'
import { Link } from '../app/router'
import { text } from './messages'
import { sameAddress, senderLabel } from './sender-options'
import { useSenderOptions, type SenderOptionsState } from './use-sender-options'

type MailSenderSelectProps = { field: FieldModel; value: unknown; invalid?: boolean; onChange: (value: string) => void }

/**
 * A mail sender field's dropdown: the signed-in person's addresses, as `Name <address>`, after the empty choice, which
 * sends from the sender's default. A stored address they cannot send from still shows, marked not available with a
 * hint to their account page, and stays as it is until they choose another: saving other fields keeps it. While their
 * addresses are read it shows alone, so nothing moves when they come in.
 */
export const MailSenderSelect = (props: MailSenderSelectProps) => <MailSenderChoices {...props} {...useSenderOptions()} />

/** `MailSenderSelect` with the person's addresses given: `options` undefined while they are read. */
export const MailSenderChoices = ({ field, value, invalid, onChange, options, error, retry }: MailSenderSelectProps & SenderOptionsState) => {
  const stored = String(value ?? '')
  const offered = options?.find((option) => stored !== '' && sameAddress(option.address, stored))
  const unavailable = stored !== '' && options !== undefined && !offered
  return (
    <div className="flex flex-col gap-1">
      <Select invalid={invalid} disabled={options === undefined && !error} value={offered?.address ?? stored} onChange={(event) => onChange(event.target.value)}>
        {(field.nullable || stored === '') && <option value="">{text(field.nullable ? 'defaultSender' : 'chooseSender')}</option>}
        {stored !== '' && !offered && <option value={stored}>{unavailable ? text('senderNotAvailable', { address: stored }) : stored}</option>}
        {(options ?? []).map((option) => (
          <option key={option.address} value={option.address}>
            {senderLabel(option)}
          </option>
        ))}
      </Select>
      {unavailable && (
        <p className="text-muted-foreground">
          {text.rich('senderNotYours', { account: <Link to={accountPath} className="font-medium text-primary-text hover:underline">{text('accountPage')}</Link> })}
        </p>
      )}
      {error && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-danger-text">{error}</p>
          {retry && <Button size="sm" onClick={retry}>{text('tryAgain')}</Button>}
        </div>
      )}
    </div>
  )
}

/** A stored mail sender as a read view shows it: `Name <address>` when it is one of the signed-in person's, else the address. */
export const MailSenderValue = ({ value }: { value: string }) => {
  const { options } = useSenderOptions()
  const offered = options?.find((option) => sameAddress(option.address, value))
  return <span className="break-words">{offered ? senderLabel(offered) : value}</span>
}
