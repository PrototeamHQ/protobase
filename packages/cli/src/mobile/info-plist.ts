const end = '</dict>\n</plist>'

/** The app's Info.plist allowing plain http to local addresses only (`NSAllowsLocalNetworking`), never to the internet. */
export const withLocalNetworking = (plist: string) => {
  if (plist.includes('<key>NSAppTransportSecurity</key>')) throw new Error('Info.plist already has NSAppTransportSecurity')
  const at = plist.lastIndexOf(end)
  if (at < 0) throw new Error('Info.plist does not end with </dict></plist>')
  return `${plist.slice(0, at)}\t<key>NSAppTransportSecurity</key>\n\t<dict>\n\t\t<key>NSAllowsLocalNetworking</key>\n\t\t<true/>\n\t</dict>\n${plist.slice(at)}`
}
