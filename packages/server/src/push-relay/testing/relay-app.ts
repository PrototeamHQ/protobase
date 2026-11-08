import { Hono } from 'hono'
import type { Device } from '../../notifications/device'
import type { PushMessage } from '../../notifications/message'
import type { PushAnswer, PushSender } from '../../notifications/sender'
import { HttpProblem, problemResponse } from '../../problem'
import { newCredential } from '../credential'
import { pushRelayRoutes } from '../routes'
import type { RelayStore } from '../store'

/** A sender that records what it is sent and answers each device as `answer` says, `ok` by default. */
export const recordingSender = (kind: 'apns' | 'fcm', answer: (device: Device) => PushAnswer['result'] = () => 'ok') => {
  const sent: { message: PushMessage; devices: Device[] }[] = []
  const sender: PushSender = {
    kinds: [kind],
    send: async (message, devices) => {
      sent.push({ message, devices: [...devices] })
      return devices.map((device) => ({ id: device.id, result: answer(device) }))
    },
  }
  return { sender, sent }
}

/** The relay's routes on `store` at `/relay`, with problems rendered as the app's error handler renders them. */
export const relayApp = (store: RelayStore, senders: { apns?: PushSender; fcm?: PushSender }, now?: () => number) => {
  const app = new Hono()
  app.onError((error) => {
    if (error instanceof HttpProblem) return problemResponse(error, '/relay')
    throw error
  })
  app.route('/relay', pushRelayRoutes({ store, senders, appId: 'net.example.app', ...(now && { now }) }))
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(`/relay/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  const register = async (body: unknown) => (await (await post('register', body)).json()) as { handle: string }
  const send = (credential: string, body: unknown) => post('send', body, { authorization: `Bearer ${credential}` })
  const credentialFor = async (origin: string) => {
    const { text, stored } = newCredential(origin)
    await store.addCredential(stored)
    return text
  }
  return { post, register, send, credentialFor }
}
