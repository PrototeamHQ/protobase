/** The stock live updater's (8.7.1) methods, by what page script may do with them. */
enum LiveUpdateMethods {
    /** Forwarded with their input cleared. */
    static let cleared = ["ready", "reload", "getCurrentBundle", "getNextBundle", "getDownloadedBundles", "getVersionCode", "getVersionName"]
    /** Forwarded with only the input the guard checked and built. */
    static let checked = ["setNextBundle"]
    /** Done by the guard itself, never by the stock code. */
    static let own = ["downloadBundle"]
    /** Never forwarded: deleting, resetting, the vendor's cloud, config, channel and ids. */
    static let refused = [
        "clearBlockedBundles", "deleteBundle", "fetchChannels", "fetchLatestBundle", "getBlockedBundles", "getBundles", "getChannel",
        "getConfig", "getCustomId", "getDeviceId", "isSyncing", "reset", "resetConfig", "setChannel", "setConfig", "setCustomId", "sync",
    ]

    static var forwarded: [String] { cleared + checked }
    static var declared: [String] { forwarded + own + refused }
}
