import { isJsonObject, mergeJson, type JsonObject, type JsonValue } from '../json-value'
import { PushMessageError, type PushMessage } from '../message'
import { tapUrl } from '../tap-url'

const checkedUrl = (value: JsonValue, field: string) => {
  const url = tapUrl(value)
  if (url === undefined) throw new PushMessageError(field)
  return url
}

// Every field a browser may navigate to on tap, checked as the message's url is and written as the parser writes it:
// the `url` the service worker reads, and the declarative format's `notification.navigate` and each action's.
const withCheckedUrls = (payload: JsonObject): JsonObject => {
  const checked = { ...payload }
  if (checked.url !== undefined) checked.url = checkedUrl(checked.url, 'platform.web.payload.url')
  if (checked.notification === undefined) return checked
  if (!isJsonObject(checked.notification)) throw new PushMessageError('platform.web.payload.notification')
  const notification = { ...checked.notification }
  if (notification.navigate !== undefined) notification.navigate = checkedUrl(notification.navigate, 'platform.web.payload.notification.navigate')
  if (notification.actions !== undefined) {
    if (!Array.isArray(notification.actions)) throw new PushMessageError('platform.web.payload.notification.actions')
    notification.actions = notification.actions.map((action, index) => {
      const field = `platform.web.payload.notification.actions.${index}`
      if (!isJsonObject(action)) throw new PushMessageError(field)
      return action.navigate === undefined ? action : { ...action, navigate: checkedUrl(action.navigate, `${field}.navigate`) }
    })
  }
  return { ...checked, notification }
}

/**
 * The JSON a browser's service worker gets, from a checked message: its title, body, url, data, badge and tag, with
 * `platform.web.payload` merged over them. Every url in it is checked again after the merge, so the payload never
 * carries one that is no absolute `http` or `https` URL.
 */
export const webPushPayload = (message: PushMessage): JsonObject => {
  const common: JsonObject = { title: message.title }
  if (message.body !== undefined) common.body = message.body
  if (message.url !== undefined) common.url = message.url
  if (message.data !== undefined) common.data = message.data
  if (message.badge !== undefined) common.badge = message.badge
  if (message.tag !== undefined) common.tag = message.tag
  return withCheckedUrls(mergeJson(common, message.platform?.web?.payload ?? {}))
}
