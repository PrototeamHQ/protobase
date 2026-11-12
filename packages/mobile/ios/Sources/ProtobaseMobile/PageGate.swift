import Foundation

/**
 * Holds the requests for the app's own files, its page among them, while a fresh install's purge runs, so no page script
 * reads what it removes. Closed only by FreshInstall; main thread only, where WebKit and the purge call it.
 */
final class PageGate {
    static let shared = PageGate()

    private(set) var isClosed = false
    private var waiting: [(id: ObjectIdentifier, run: () -> Void)] = []

    func close() {
        isClosed = true
    }

    /** Opens the gate, running what waits in the order it came. */
    func open() {
        isClosed = false
        let runs = waiting
        waiting = []
        for item in runs { item.run() }
    }

    /** Runs `run` now when the gate is open, else once it opens, unless `cancel(id)` comes first. */
    func whenOpen(_ id: ObjectIdentifier, _ run: @escaping () -> Void) {
        guard isClosed else {
            run()
            return
        }
        waiting.append((id, run))
    }

    /** Whether `id` was waiting; it no longer is. */
    func cancel(_ id: ObjectIdentifier) -> Bool {
        guard let index = waiting.firstIndex(where: { $0.id == id }) else { return false }
        waiting.remove(at: index)
        return true
    }
}
