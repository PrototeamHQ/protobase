/**
 * After a sign-in: runs `update`, then `enter` unless the update reloaded the page, which then opens the app itself.
 * `enter` runs even when the update fails, so a signed-in user always gets in; the update's error is thrown after it.
 */
export const enterAfterUpdate = async (update: (() => Promise<boolean>) | undefined, enter: () => Promise<void>) => {
  let reloaded = false
  try {
    reloaded = Boolean(await update?.())
  } finally {
    if (!reloaded) await enter()
  }
}
