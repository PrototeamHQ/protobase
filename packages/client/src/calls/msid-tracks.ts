/**
 * The `mid` of each media section of a description by the sending browser's track id, which its `a=msid` line names: a
 * receiver's own track may have another id, when the browser reused one of its transceivers for the section.
 */
export const midsByTrackId = (sdp: string) => {
  const mids = new Map<string, string>()
  for (const section of sdp.split(/\r?\nm=/).slice(1)) {
    const mid = /^a=mid:(\S+)/m.exec(section)?.[1]
    const track = /^a=msid:\S+ (\S+)/m.exec(section)?.[1]
    if (mid !== undefined && track !== undefined) mids.set(track, mid)
  }
  return mids
}

/**
 * The `mid` of each media section of a description by the id of the stream its `a=msid` line names. Unlike the track
 * id there, which Firefox makes up for each sender, both browsers write the sending page's stream id.
 */
export const midsByStreamId = (sdp: string) => {
  const mids = new Map<string, string>()
  for (const section of sdp.split(/\r?\nm=/).slice(1)) {
    const mid = /^a=mid:(\S+)/m.exec(section)?.[1]
    const stream = /^a=msid:(\S+) \S+/m.exec(section)?.[1]
    if (mid !== undefined && stream !== undefined && stream !== '-') mids.set(stream, mid)
  }
  return mids
}
