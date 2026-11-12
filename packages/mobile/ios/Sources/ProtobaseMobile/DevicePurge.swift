import Capacitor
import Foundation
import WebKit

/**
 * Removes everything a fresh install lacks, through the APIs that own each part rather than by WebKit's folders: the
 * device's cookie jar, the session, the app's user defaults, the live update Capacitor would load and the bundles it
 * downloaded, at once, so the bridge reads none of it; then the WebView's data (drafts, cookies, caches), which WebKit
 * removes in its own time, calling `done` once it has. Main thread only.
 */
enum DevicePurge {
    static func run(done: @escaping () -> Void) throws {
        HTTPCookieStorage.shared.removeCookies(since: .distantPast)
        try SessionStore(keychain: DeviceKeychain()).save(.none)
        if let id = Bundle.main.bundleIdentifier { UserDefaults.standard.removePersistentDomain(forName: id) }
        try removeMissingOk { try KeyValueStore.standard.delete("serverBasePath") }
        try removeMissingOk { try FileManager.default.removeItem(atPath: BundlesFolder.path) }
        WKWebsiteDataStore.default().removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast, completionHandler: done)
    }

    private static func removeMissingOk(_ remove: () throws -> Void) throws {
        do {
            try remove()
        } catch let error as CocoaError where error.code == .fileNoSuchFile {
            return
        }
    }
}
