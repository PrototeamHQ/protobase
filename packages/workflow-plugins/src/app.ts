import { definePlugin } from '@protobase/workflows/plugin'
import { httpSteps } from './http'
import { mailSteps } from './mail'
import { pieceSteps } from './piece'
import { recordTriggers } from './record-trigger'
import { recordsSteps } from './records'
import { scheduleTriggers } from './schedule'
import { storageSteps } from './storage'
import { webhookTriggers } from './webhook'

/** The built-in types, `app:<key>`: one plugin like any other, on the public interface alone. */
export const appPlugin = definePlugin({
  name: 'app',
  label: 'Built-in',
  steps: { ...httpSteps, ...recordsSteps, ...mailSteps, ...storageSteps, ...pieceSteps },
  triggers: { ...recordTriggers, ...scheduleTriggers, ...webhookTriggers },
})
