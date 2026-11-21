import { chatDayLabel } from '../../chat/chat-day'
import { formatTime } from '../../format/date'
import { viewerZone } from '../../format/zone'
import { text } from './messages'

/** When a thread's last reply came, sent at `time`: "Last reply Today, 10:42", in the viewer's zone unless given. */
export const lastReplyLabel = (time: string, now = Date.now(), zone = viewerZone()) => text('lastReply', { time: `${chatDayLabel(time, now, zone)}, ${formatTime(Date.parse(time), zone)}` })
