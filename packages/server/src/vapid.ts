// `@protobase/server/vapid`: the VAPID key pair of Web Push and the variables that hold it, apart from the main entry so
// `protobase notifications vapid-keys` makes one without loading the server.
export { generateVapidKeys } from './notifications/web-push/keys'
export { vapidPrivateKeyVariable, vapidPublicKeyVariable, vapidSubjectVariable } from './notifications/web-push/vapid-settings'
