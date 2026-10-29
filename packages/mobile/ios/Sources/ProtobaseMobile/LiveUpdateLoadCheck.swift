/**
 * Why the guard refuses to load the live updater, or nil. A stock method the guard does not declare means a plugin
 * upgrade added one: no live updater then rather than an open one. Background updates sync with the vendor's cloud
 * outside every method (LiveUpdate.swift, handleLoad); `autoDeleteBundles` and a `readyTimeout` make ready() drop every
 * bundle but the current and next one and roll back a bundle that never gets ready, so page script cannot pin an
 * older one. What the guard takes a release by is checked as it is read (LiveUpdatePins).
 */
enum LiveUpdateLoadCheck {
    static func refusal(_ settings: LiveUpdateSettings, stockMethods: [String]?, stockResponds: (String) -> Bool) -> String? {
        guard let stockMethods else { return "LiveUpdate has no stock LiveUpdatePlugin in this Protobase app" }
        if let unguarded = stockMethods.first(where: { !LiveUpdateMethods.declared.contains($0) }) {
            return "LiveUpdate.\(unguarded) has no guard in this Protobase app"
        }
        if let missing = LiveUpdateMethods.forwarded.first(where: { !stockResponds($0) }) {
            return "LiveUpdate.\(missing) is missing from the stock LiveUpdatePlugin"
        }
        if settings.autoUpdateStrategy != "none" { return "plugins.LiveUpdate.autoUpdateStrategy must be \"none\" in a Protobase app" }
        if !settings.autoDeleteBundles { return "plugins.LiveUpdate.autoDeleteBundles must be true in a Protobase app" }
        if settings.readyTimeout <= 0 { return "plugins.LiveUpdate.readyTimeout must be above 0 in a Protobase app" }
        return nil
    }
}
