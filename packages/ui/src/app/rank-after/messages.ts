import { defineMessages } from '../../locale/messages'

export const text = defineMessages({
  en: {
    dependsOn: (record: string, other: string) => `${record} depends on ${other}.`,
  },
  nl: {
    dependsOn: (record: string, other: string) => `${record} hangt af van ${other}.`,
  },
})
