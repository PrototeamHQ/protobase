/** The server refused tracks the member may not send, such as a camera for a member who may only listen. */
export class PublishRefused extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'PublishRefused'
  }
}
