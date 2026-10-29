import Foundation

/**
 * The guard's decisions on releases, apart from Capacitor so they can be tested: downloading one itself and choosing
 * the next bundle. One lock covers the highest order downloaded and the choice of the next bundle, for every guard of
 * the process.
 */
final class LiveUpdateGuard {
    /** What the guard reads of the app and the stock plugin, injected so tests stand in for them. */
    struct Environment {
        /** The bundles folder, where the stock code keeps bundles by id. */
        var bundles: String
        /** Where downloads are put together, beside the bundles folder on the same volume and outside it. */
        var downloads: String
        /** The binary's own files, with the manifest the CLI writes beside them. */
        var builtInFiles: String
        var defaults: UserDefaults
        /** The path the app runs, Capacitor's server base path, or nil. */
        var currentPath: () -> String?
        /** The path the app runs at the next start, as the stock code keeps it, or nil for the built-in files. */
        var nextPath: () -> String?
        var source: ReleaseSource
    }

    private static let lock = NSLock()

    let pins: LiveUpdatePins
    let environment: Environment
    private var marks: LiveUpdateMarks { LiveUpdateMarks(defaults: environment.defaults) }

    init(pins: LiveUpdatePins, environment: Environment) {
        self.pins = pins
        self.environment = environment
    }

    /** Deletes what a download the app did not finish left. */
    func clearDownloads() {
        BundleRemoval.delete(root: (environment.downloads as NSString).deletingLastPathComponent, target: environment.downloads)
    }

    /** Whether the stock plugin blocked bundle `bundleId` after rolling it back. */
    func isBlocked(_ bundleId: String) -> Bool {
        BlockedBundles.blocks(environment.defaults.object(forKey: BlockedBundles.key), bundleId)
    }

    private func refuseBlocked(_ bundleId: String) throws {
        if isBlocked(bundleId) { throw BundleRefused("it was rolled back") }
    }

    /** Downloads release `bundleId`, a bundle id, into the bundles folder, and raises the highest order downloaded. */
    func download(_ bundleId: String) throws {
        try refuseBlocked(bundleId)
        let dir = environment.downloads + "/" + UUID().uuidString
        defer { BundleRemoval.delete(root: environment.downloads, target: dir) }
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(atPath: environment.bundles, withIntermediateDirectories: true)
        let current = bundleIdOf(environment.currentPath())
        let own = OwnFiles.inFolder(current.map { environment.bundles + "/" + $0 } ?? environment.builtInFiles)
        let highest = try locked { try marks.highest() }
        let release = ReleaseDownload(source: environment.source, key: pins.key, binary: pins.binary)
        let statement = try release.download(bundleId, into: dir, own: own, builtIn: pins.builtInOrder, highest: highest)
        // The same release downloaded before stays; setNextBundle checks it anyway.
        let target = environment.bundles + "/" + bundleId
        if LocalFile.kind(target) == .missing && rename(dir, target) != 0 { throw BundleRefused("it could not be moved into place") }
        try locked { try marks.raise(statement.order) }
    }

    /**
     * Checks bundle `bundleId`, which names a bundle folder, on disk, then has `choose` set it as the next bundle, under
     * the lock: it must not be blocked, it must be above the running bundle's order and the built-in files', and not
     * below the highest order downloaded. A refused bundle that is neither running nor next is deleted.
     */
    func setNext(_ bundleId: String, choose: () -> Void) throws {
        try locked {
            do {
                try refuseBlocked(bundleId)
                let next = try BundleCheck.check(environment.bundles + "/" + bundleId, bundleId: bundleId, key: pins.key, binary: pins.binary)
                try ReleaseOrder.acceptNext(next.order, current: currentOrder(), builtIn: pins.builtInOrder, highest: marks.highest())
            } catch let refused as BundleRefused {
                if bundleId != self.bundleIdOf(environment.currentPath()) && bundleId != self.bundleIdOf(environment.nextPath()) {
                    BundleRemoval.delete(root: environment.bundles, target: environment.bundles + "/" + bundleId)
                }
                throw refused
            }
            choose()
        }
    }

    // The running bundle's order: the built-in files', or what its statement says, checked against the key and this
    // binary. One that cannot be read or checked refuses, rather than falling back to the built-in order.
    private func currentOrder() throws -> [Int64] {
        guard let current = bundleIdOf(environment.currentPath()) else { return pins.builtInOrder }
        do {
            let file = try LocalFile.read(environment.bundles + "/" + current + "/" + ReleaseStatement.file, limit: ReleaseStatement.maxBytes, "its statement")
            let statement = try ReleaseStatement.verify(file, bundleId: current, key: pins.key)
            try pins.binary.accept(statement)
            return statement.order
        } catch let refused as BundleRefused {
            throw BundleRefused("the running bundle's statement could not be checked: \(refused.reason)")
        }
    }

    /**
     * The id of the downloaded bundle at `path`, as the stock code names it (LiveUpdate.swift, getCurrentBundleId), or
     * nil for the built-in files and any path that is not a bundle folder's.
     */
    func bundleIdOf(_ path: String?) -> String? {
        guard let path, !path.isEmpty else { return nil }
        let url = URL(fileURLWithPath: path).standardized
        let name = url.lastPathComponent
        guard url.deletingLastPathComponent().path == URL(fileURLWithPath: environment.bundles).standardized.path,
              BundlesFolder.isBundleId(name, in: environment.bundles) else { return nil }
        return name
    }

    private func locked<T>(_ body: () throws -> T) rethrows -> T {
        Self.lock.lock()
        defer { Self.lock.unlock() }
        return try body()
    }
}
