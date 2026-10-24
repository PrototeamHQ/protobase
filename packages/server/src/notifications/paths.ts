/** The name of the device id in a device's path. */
export const deviceIdParam = 'id'

/** The path of the caller's devices under the API's system path (`/api`), or of one of them by its id. */
export const devicesPath = (systemPath: string, id?: string) => `${systemPath}/notifications/devices${id === undefined ? '' : `/${encodeURIComponent(id)}`}`
