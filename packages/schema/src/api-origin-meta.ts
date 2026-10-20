/**
 * The `<meta name>` whose `content` names the origin of the API the shell calls, such as `https://shop.example.com`, for
 * a page served from elsewhere: `protobase mobile` writes it into the app's `index.html`. Without it, the shell calls
 * the API on its own origin.
 */
export const apiOriginMeta = 'protobase-api-origin'
