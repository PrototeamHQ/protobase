import Foundation

/**
 * The workspaces the shell lists, in native storage (`UserDefaults`), beyond page script: one per origin, in the
 * order they were added. A removed workspace's id waits in `removedStores` until its data store is deleted.
 */
final class WorkspaceList {
    enum Failure: Error {
        case listed
        case unknown
    }

    private static let listKey = "ProtobaseWorkspaces"
    private static let removedKey = "ProtobaseWorkspacesRemoved"

    private let defaults: UserDefaults

    init(_ defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func all() throws -> [Workspace] {
        guard let data = defaults.data(forKey: Self.listKey) else { return [] }
        return try JSONDecoder().decode([Workspace].self, from: data)
    }

    func find(_ id: String) throws -> Workspace {
        guard let workspace = try all().first(where: { $0.id == id }) else { throw Failure.unknown }
        return workspace
    }

    func add(origin: URL, name: String?, icon: String?) throws -> Workspace {
        let workspaces = try all()
        guard !workspaces.contains(where: { $0.origin == origin.absoluteString }) else { throw Failure.listed }
        let workspace = Workspace(id: UUID().uuidString, origin: origin.absoluteString, name: name, icon: icon)
        try save(workspaces + [workspace])
        return workspace
    }

    func remove(_ id: String) throws {
        let workspaces = try all()
        guard workspaces.contains(where: { $0.id == id }) else { throw Failure.unknown }
        defaults.set(removedStores() + [id], forKey: Self.removedKey)
        try save(workspaces.filter { $0.id != id })
    }

    func removedStores() -> [String] {
        defaults.stringArray(forKey: Self.removedKey) ?? []
    }

    func storeRemoved(_ id: String) {
        defaults.set(removedStores().filter { $0 != id }, forKey: Self.removedKey)
    }

    private func save(_ workspaces: [Workspace]) throws {
        defaults.set(try JSONEncoder().encode(workspaces), forKey: Self.listKey)
    }
}
