import { useMemo } from 'react'
import { encode } from 'uqr'

/** The `otpauth://` URI as a QR code for an authenticator app to scan: one square per dark module, with a quiet border. */
export const TotpQr = ({ uri, className }: { uri: string; className?: string }) => {
  const { size, path } = useMemo(() => {
    const qr = encode(uri, { ecc: 'M', border: 2 })
    const squares = qr.data.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : [])))
    return { size: qr.size, path: squares.join('') }
  }, [uri])
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR code for your authenticator app" shapeRendering="crispEdges" className={className}>
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}

/** The secret in an `otpauth://` URI, in groups of four, for typing into an app that cannot scan. */
export const totpKey = (uri: string) => (new URL(uri).searchParams.get('secret') ?? '').replace(/(.{4})(?=.)/g, '$1 ')
