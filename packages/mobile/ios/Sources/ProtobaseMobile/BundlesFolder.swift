import Foundation

/**
 * Where the live updater unzips bundles (capacitor-live-update's LiveUpdate.swift) and Capacitor serves a persisted
 * server base path from (CAPBridgeViewController.swift).
 */
enum BundlesFolder {
    static var path: String { NSHomeDirectory() + "/Library/NoCloud/ionic_built_snapshots" }

    // One path component: no separator, no `.` or `..`, no NUL, ASCII only.
    private static let bundleId = try! NSRegularExpression(pattern: "^[A-Za-z0-9_-]{1,64}$")

    static func isBundleIdShape(_ id: String) -> Bool {
        bundleId.firstMatch(in: id, range: NSRange(id.startIndex..., in: id)) != nil
    }

    /**
     * An id that names an existing direct child of `root` once symlinks are resolved, by its exact name on disk: the stock
     * code joins ids to the folder unchecked, and the volume ignores case, so `ABC` would open `abc`.
     */
    static func isBundleId(_ id: String, in root: String = path) -> Bool {
        guard isBundleIdShape(id), let rootPath = realPath(root), let resolved = realPath(root + "/" + id) else { return false }
        let url = URL(fileURLWithPath: resolved)
        return url.deletingLastPathComponent().path == rootPath && url.lastPathComponent == id
    }
}
