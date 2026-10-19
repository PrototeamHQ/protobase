import { defineMessages } from '../locale/messages'

export const text = defineMessages({
  en: {
    rows: (count: string) => `${count} rows`,
    aboutRows: (count: string) => `about ${count} rows`,
    secondsAgo: (count: number) => `${count} s ago`,
    minutesAgo: (count: number) => `${count} min ago`,
    hoursAgo: (count: number) => `${count} h ago`,
    daysAgo: (count: number) => `${count} d ago`,
    justNow: 'just now',
  },
  nl: {
    rows: (count: string) => `${count} rijen`,
    aboutRows: (count: string) => `ongeveer ${count} rijen`,
    secondsAgo: (count: number) => `${count} s geleden`,
    minutesAgo: (count: number) => `${count} min geleden`,
    hoursAgo: (count: number) => `${count} u geleden`,
    daysAgo: (count: number) => `${count} d geleden`,
    justNow: 'zojuist',
  },
})
