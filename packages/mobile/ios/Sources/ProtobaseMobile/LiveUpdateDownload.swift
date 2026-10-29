import Foundation

/**
 * What page script may ask to download: a manifest from the app's own releases URL, `releasesUrl + "/" + bundleId`,
 * by a bundle id. The guard downloads it itself (ReleaseDownload); a caller's checksum, signature and key are ignored.
 */
enum LiveUpdateDownload {
    /** The bundle id the call asks for, or nil when it is refused. */
    static func bundleId(_ call: [AnyHashable: Any], releasesUrl: String) -> String? {
        guard call["artifactType"] as? String == "manifest", let bundleId = call["bundleId"] as? String else { return nil }
        guard BundlesFolder.isBundleIdShape(bundleId), call["url"] as? String == releasesUrl + "/" + bundleId else { return nil }
        return bundleId
    }
}

/** A few downloads per run of the app, so a loop cannot drain the data plan; a reload of the page keeps the count. */
final class DownloadBudget {
    static let shared = DownloadBudget(limit: 3)

    private let lock = NSLock()
    private let limit: Int
    private var used = 0

    init(limit: Int) {
        self.limit = limit
    }

    func take() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if used >= limit { return false }
        used += 1
        return true
    }
}
