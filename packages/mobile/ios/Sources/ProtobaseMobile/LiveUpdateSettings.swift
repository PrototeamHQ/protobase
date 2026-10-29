import Capacitor

/**
 * The live updater's `plugins.LiveUpdate` settings the guard checks, read with the stock plugin's own keys and defaults
 * (capacitor-live-update's LiveUpdatePlugin.swift, liveUpdateConfig), plus Protobase's `releasesUrl`. They come from
 * capacitor.config.json, which ships in the binary outside the web part, beyond page script and a live update.
 */
struct LiveUpdateSettings {
    var autoUpdateStrategy: String?
    var autoDeleteBundles: Bool
    var readyTimeout: Int
    var releasesUrl: String?
    var publicKey: String?
}

extension LiveUpdateSettings {
    init(_ config: PluginConfig) {
        self.init(
            autoUpdateStrategy: config.getString("autoUpdateStrategy", "none"),
            autoDeleteBundles: config.getBoolean("autoDeleteBundles", false),
            readyTimeout: config.getInt("readyTimeout", 0),
            releasesUrl: config.getString("releasesUrl"),
            publicKey: config.getString("publicKey"))
    }
}
