import Foundation

/**
 * Where the live updater unzips bundles (capacitor-live-update's LiveUpdate.swift) and Capacitor serves a persisted
 * server base path from (CAPBridgeViewController.swift).
 */
enum BundlesFolder {
    static var path: String { NSHomeDirectory() + "/Library/NoCloud/ionic_built_snapshots" }
}
