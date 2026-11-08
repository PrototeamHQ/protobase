import WebKit

/**
 * Deletes the data stores of removed workspaces, whose ids WorkspaceList keeps until then. WebKit refuses to delete a
 * store a WebView still uses, such as one that has not finished closing; that store stays listed and is deleted by a
 * later `list()` or `remove()`.
 */
enum WorkspaceStores {
    /** Deletes each removed workspace's store WebKit lets go of and drops its id from the list; a store still in use stays listed, and before iOS 17 nothing is deleted. */
    @MainActor
    static func removePending(_ list: WorkspaceList) async throws {
        guard #available(iOS 17.0, *) else { return }
        for id in list.removedStores() {
            guard let store = UUID(uuidString: id) else {
                list.storeRemoved(id)
                continue
            }
            do {
                try await WKWebsiteDataStore.remove(forIdentifier: store)
                list.storeRemoved(id)
            } catch let error as NSError where error.domain == WKErrorDomain {
                continue
            }
        }
    }
}
