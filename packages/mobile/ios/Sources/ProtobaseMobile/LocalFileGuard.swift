import Capacitor
import Foundation

/**
 * Decides which `capacitor://localhost` paths the app's asset handler may serve to page script: none of the local file
 * or native HTTP routes, no `..`, and from a base path outside the app bundle only files that are really inside the
 * live updater's bundles folder. Each check runs on the decoded path, the one the asset handler opens.
 */
final class LocalFileGuard {
    // Where the live updater unzips bundles (capacitor-live-update's LiveUpdate.swift) and Capacitor serves a persisted
    // server base path from (CAPBridgeViewController.swift).
    private static let bundlesFolder = "Library/NoCloud/ionic_built_snapshots"
    private static let refusedPrefixes = [
        CapacitorBridge.fileStartIdentifier,
        CapacitorBridge.httpInterceptorStartIdentifier,
        CapacitorBridge.httpsInterceptorStartIdentifier,
    ]

    private let lock = NSLock()
    private let appBundle: String?
    // Resolved once: with no bundles folder at launch, nothing outside the app bundle is served.
    private let bundles: String?
    var basePath: String

    init(basePath: String) {
        self.basePath = basePath
        appBundle = Self.realPath(Bundle.main.bundlePath)
        bundles = Self.realPath(NSHomeDirectory() + "/" + Self.bundlesFolder)
    }

    func withLock<T>(_ body: () throws -> T) rethrows -> T {
        lock.lock()
        defer { lock.unlock() }
        return try body()
    }

    func refuses(path: String) -> Bool {
        if Self.refusedPrefixes.contains(where: { path.hasPrefix($0) }) { return true }
        if path.contains("\0") || path.split(separator: "/", omittingEmptySubsequences: false).contains("..") { return true }
        guard let base = Self.realPath(basePath) else { return true }
        if let appBundle, Self.isInside(base, appBundle) { return false }
        guard let bundles else { return true }
        // The file the asset handler opens, by Capacitor's own routing.
        var router = CapacitorRouter()
        router.basePath = basePath
        guard let file = Self.realPath(router.route(for: path)) else { return true }
        return !Self.isInside(file, bundles)
    }

    private static func isInside(_ path: String, _ folder: String) -> Bool {
        path == folder || path.hasPrefix(folder.hasSuffix("/") ? folder : folder + "/")
    }

    private static func realPath(_ path: String) -> String? {
        guard let resolved = realpath(path, nil) else { return nil }
        defer { free(resolved) }
        return String(cString: resolved)
    }
}
