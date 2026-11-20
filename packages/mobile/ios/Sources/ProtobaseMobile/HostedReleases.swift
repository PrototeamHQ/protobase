import Foundation

/**
 * The live updater for a host's own native views, which serve the shell's files themselves rather than through
 * Capacitor's web view (GuardedLiveUpdatePlugin's target). The same guard takes every release (LiveUpdateGuard): the
 * statement, key, binary and order checks, and the download. What differs is the swap: the host reads `currentFiles`,
 * the folder it serves, starts a `check`, which sets a new release next and says so, and calls `swap` when it is ready
 * to serve that release, such as before it opens a view. Nothing else changes which files it serves.
 *
 * Its releases, their downloads and its marks are its own, under `name`, apart from the Capacitor target's, so a host
 * may keep several, one per set of files it serves.
 */
public final class HostedReleases {
    /** Where the guard works and what it reads, by folder and user defaults suite. */
    struct Storage {
        let root: String
        let defaults: UserDefaults

        var bundles: String { root + "/bundles" }
        var downloads: String { root + "/downloads" }

        /** The app's own storage for `name`. */
        static func app(_ name: String) -> Storage {
            Storage(root: NSHomeDirectory() + "/Library/NoCloud/protobase_hosted_releases/" + name, defaults: UserDefaults(suiteName: "net.protobase.mobile.hosted-releases." + name) ?? .standard)
        }
    }

    // One check at a time.
    private let checks = DispatchQueue(label: "net.protobase.mobile.hosted-release-checks")
    // Covers the state between a check's choice and a swap.
    private let lock = NSLock()

    private let guarded: LiveUpdateGuard
    private let asking: ReleaseAsking
    private let state: HostedReleaseState
    private let builtInFiles: URL

    /**
     * The updater of the files in `builtInFiles`, the binary's own with the manifest beside them, taking releases by
     * `settings`, or why it cannot. `name` is one path component naming this set of files.
     */
    public static func make(_ settings: HostedReleaseSettings, builtInFiles: URL, name: String = "shell", appId: String? = Bundle.main.bundleIdentifier) -> Result<HostedReleases, LoadRefusal> {
        guard BundlesFolder.isBundleIdShape(name) else { return .failure(LoadRefusal("HostedReleases needs a name of letters, digits, - and _")) }
        let pins = LiveUpdatePins.make(releasesUrl: settings.releasesUrl, publicKey: settings.publicKey, fingerprint: settings.fingerprint, shellVersion: settings.shellVersion, builtInOrder: settings.builtInOrder, appId: appId)
        return pins.flatMap { pins in
            guard let query = ReleaseQuery(apiOrigin: settings.apiOrigin, binary: pins.binary) else { return .failure(LoadRefusal("HostedReleases' apiOrigin makes no address")) }
            return .success(HostedReleases(pins: pins, asking: query, source: ReleaseFetch(releasesUrl: pins.releasesUrl), builtInFiles: builtInFiles, storage: .app(name)))
        }
    }

    init(pins: LiveUpdatePins, asking: ReleaseAsking, source: ReleaseSource, builtInFiles: URL, storage: Storage) {
        let state = HostedReleaseState(defaults: storage.defaults)
        self.state = state
        self.asking = asking
        self.builtInFiles = builtInFiles
        let bundles = storage.bundles
        guarded = LiveUpdateGuard(pins: pins, environment: LiveUpdateGuard.Environment(
            bundles: bundles,
            downloads: storage.downloads,
            builtInFiles: builtInFiles.path,
            defaults: storage.defaults,
            currentPath: { state.current.map { bundles + "/" + $0 } },
            nextPath: { state.next.map { bundles + "/" + $0 } },
            source: source))
        guarded.clearDownloads()
        locked { start() }
    }

    /** The folder the host serves: the downloaded release it swapped in, or the binary's own files. */
    public var currentFiles: URL {
        locked { state.current.map(folder) ?? builtInFiles }
    }

    /** The folder of the release set next, which `swap` serves, or nil when none is. */
    public var nextFiles: URL? {
        locked { state.next.map(folder) }
    }

    /**
     * Asks the server for a release and, when it names a new one, downloads it, checks it and sets it next, in the
     * background; `done` gets what happened, on the main queue. A check while one runs waits for it and for its `done`,
     * so a release reported ready is still there while `done` runs.
     */
    public func check(_ done: @escaping (HostedCheck) -> Void = { _ in }) {
        checks.async { [self] in
            let outcome = run()
            DispatchQueue.main.sync { done(outcome) }
        }
    }

    /**
     * Makes the release set next the one the host serves, checked on disk once more, and deletes every other release.
     * False when none is set next, or it fails its check, which drops it.
     */
    @discardableResult
    public func swap() -> Bool {
        locked {
            guard let next = state.next, next != state.current else { return false }
            state.next = nil
            guard (try? BundleCheck.check(guarded.environment.bundles + "/" + next, bundleId: next, key: guarded.pins.key, binary: guarded.pins.binary)) != nil else {
                prune()
                return false
            }
            state.current = next
            prune()
            return true
        }
    }

    private func run() -> HostedCheck {
        let (current, next) = locked { (state.current, state.next) }
        guard let id = SwapDecision.take(asking.answer(), current: current, next: next) else { return .unchanged }
        do {
            try guarded.download(id)
            try locked {
                try guarded.setNext(id) { state.next = id }
                prune()
            }
            return .ready(folder(id))
        } catch let refused as BundleRefused {
            locked { prune() }
            return .refused(refused.reason)
        } catch {
            locked { prune() }
            return .failed
        }
    }

    /**
     * At the start: the release swapped in earlier, and the one set next, each stay only while it passes its check, for
     * this binary and above its own files, which an update of the app may have raised; otherwise the host serves the
     * binary's own files again, and nothing is set next.
     */
    private func start() {
        if let current = state.current, !holds(current) { state.current = nil }
        if let next = state.next, !holds(next) { state.next = nil }
        prune()
    }

    // Whether release `id` passes its check and is newer than the binary's own files.
    private func holds(_ id: String) -> Bool {
        let statement = try? BundleCheck.check(guarded.environment.bundles + "/" + id, bundleId: id, key: guarded.pins.key, binary: guarded.pins.binary)
        return statement.map { ReleaseOrder.compare($0.order, guarded.pins.builtInOrder) > 0 } ?? false
    }

    // Deletes every release folder but the current and next one.
    private func prune() {
        let bundles = guarded.environment.bundles
        let kept = Set([state.current, state.next].compactMap { $0 })
        for name in (try? FileManager.default.contentsOfDirectory(atPath: bundles)) ?? [] where !kept.contains(name) {
            BundleRemoval.delete(root: bundles, target: bundles + "/" + name)
        }
    }

    private func locked<T>(_ body: () throws -> T) rethrows -> T {
        lock.lock()
        defer { lock.unlock() }
        return try body()
    }

    private func folder(_ id: String) -> URL {
        URL(fileURLWithPath: guarded.environment.bundles + "/" + id, isDirectory: true)
    }
}
