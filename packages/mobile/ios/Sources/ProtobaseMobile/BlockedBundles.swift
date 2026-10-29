import Foundation

/**
 * The bundles the stock plugin blocked after rolling them back (`autoBlockRolledBackBundles`): ready() adds the id of
 * a bundle that never got ready to a comma separated list in its user defaults (LiveUpdate.swift, addBlockedBundleId,
 * and LiveUpdatePreferences.swift of @capawesome/capacitor-live-update 8.7.1). The stock code reads it only in sync(),
 * which the guard refuses, so the guard reads it itself.
 */
enum BlockedBundles {
    /** The stock plugin's key: its prefix and key, which its source marks "DO NOT CHANGE". */
    static let key = "CapawesomeLiveUpdate.blockedBundleIds"

    /**
     * Whether `value`, the stock list as stored, blocks `bundleId`. The stock code stores nothing until it blocks one,
     * so none is an empty list; a value of another type, or an entry that is no bundle id, as after a plugin upgrade
     * that changed its format, is a list the guard cannot read, which blocks every id, so it fails closed.
     */
    static func blocks(_ value: Any?, _ bundleId: String) -> Bool {
        guard let value else { return false }
        guard let list = value as? String else { return true }
        if list.isEmpty { return false }
        let ids = list.split(separator: ",", omittingEmptySubsequences: false).map(String.init)
        if !ids.allSatisfy(BundlesFolder.isBundleIdShape) { return true }
        return ids.contains(bundleId)
    }
}
