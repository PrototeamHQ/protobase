import { text } from './messages'

/** The invitation link to pass on, when the app cannot email it. */
export const LinkNotice = ({ link }: { link?: string }) =>
  link ? (
    <p className="mt-3 break-all rounded-md border bg-muted px-3 py-2 text-xs">
      {text.rich('passLinkOn', { link: <span className="font-mono">{link}</span> })}
    </p>
  ) : null
