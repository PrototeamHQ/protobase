import { useContext, useMemo } from 'react'
import { MetaContext } from '../data/meta-context'

const hostOf = (url: string) => (URL.canParse(url) ? [new URL(url).hostname] : [])

/**
 * The hosts besides the page's own whose images are drawn with the page's referrer: those `/meta` names, where the app's
 * providers link public files from, and those of the app's sources. None outside `MetaGate`.
 */
export const useTrustedImageHosts = () => {
  const meta = useContext(MetaContext)
  return useMemo(() => [...(meta?.files?.trustedHosts ?? []), ...(meta?.sources ?? []).flatMap(({ source }) => hostOf(source.url))], [meta?.files, meta?.sources])
}
