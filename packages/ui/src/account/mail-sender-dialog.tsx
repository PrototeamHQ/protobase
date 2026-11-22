import { useState } from 'react'
import type { MailSender } from '@protobase/client'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'
import { Input } from '../primitives/input'
import { Switch } from '../primitives/switch'
import { Textarea } from '../primitives/textarea'
import { SectionError } from './account-section'
import { AliasCheck, type AliasCheckProps } from './alias-check'
import { AliasCheckUnavailable } from './alias-check-panel'
import { text } from './messages'

/** What the dialog asks: the address, when it is a new one, its display name, its own signature, and if it is the default. */
export type MailSenderInput = { address: string; name: string; signature: string; isDefault: boolean }

type MailSenderDialogProps = {
  /** The address to change; without it, the dialog enters a new one. */
  sender?: MailSender
  /** The check that mail from the address goes out from it, for an address already entered. */
  check?: AliasCheckProps
  busy: boolean
  error?: string
  onSave: (input: MailSenderInput) => void
  onClose: () => void
}

/** Enters a From address, or changes one: its display name, whether it is the default, and its own signature. */
export const MailSenderDialog = ({ sender, check, busy, error, onSave, onClose }: MailSenderDialogProps) => {
  const [address, setAddress] = useState(sender?.address ?? '')
  const [name, setName] = useState(sender?.name ?? '')
  const [signature, setSignature] = useState(sender?.signature ?? '')
  const [isDefault, setDefault] = useState(sender?.isDefault ?? false)
  const save = () => onSave({ address: address.trim(), name: name.trim(), signature, isDefault })
  return (
    <Dialog
      title={sender ? sender.address : text('addFromAddress')}
      description={sender ? text('changeFromAddressDescription') : text('addFromAddressDescription')}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>{text('cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!address.trim()} onClick={save}>
            {sender ? text('save') : text('addAddress')}
          </Button>
        </>
      }
    >
      {!sender && (
        <label className="flex flex-col gap-1.5 font-medium">
          {text('fromAddress')}
          <Input autoFocus type="email" value={address} maxLength={254} placeholder={text('fromAddressPlaceholder')} onChange={(event) => setAddress(event.target.value)} />
        </label>
      )}
      <label className="mt-3 flex flex-col gap-1.5 font-medium">
        {text('fromName')}
        <Input value={name} maxLength={100} placeholder={text('fromNamePlaceholder')} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="mt-3 flex cursor-pointer items-center justify-between gap-3">
        <span>{text('defaultFromAddress')}</span>
        <Switch checked={isDefault} onChange={setDefault} label={text('defaultFromAddress')} />
      </label>
      <label className="mt-3 flex flex-col gap-1.5 font-medium">
        {text('signature')}
        <Textarea value={signature} maxLength={2000} placeholder={text('signaturePlaceholder')} onChange={(event) => setSignature(event.target.value)} />
      </label>
      <SectionError message={error} />
      {check && !check.available && <AliasCheckUnavailable />}
      {sender && check?.available && check.calls && <AliasCheck address={sender.address} calls={check.calls} {...(check.auto && { auto: true })} />}
    </Dialog>
  )
}
