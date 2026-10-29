import Foundation

/**
 * What page script may download: a manifest from the app's own releases URL, `releasesUrl + "/" + bundleId`, with
 * `publicKey` pinned, so the stock code checks the manifest and each file against it with the response's signature
 * (LiveUpdate.swift, downloadAndVerifyFile and verifyFile). A caller's checksum and signature are dropped.
 */
enum LiveUpdateDownload {
    /** The options the stock code downloads with, or nil when the call is refused. */
    static func options(_ call: [AnyHashable: Any], _ settings: LiveUpdateSettings) -> [String: Any]? {
        guard let releasesUrl = settings.releasesUrl, ReleasesUrl.isOwnSource(releasesUrl) else { return nil }
        guard let publicKey = settings.publicKey, !publicKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        guard call["artifactType"] as? String == "manifest", let bundleId = call["bundleId"] as? String else { return nil }
        let url = releasesUrl + "/" + bundleId
        guard BundlesFolder.isBundleIdShape(bundleId), call["url"] as? String == url else { return nil }
        return ["artifactType": "manifest", "bundleId": bundleId, "url": url]
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
