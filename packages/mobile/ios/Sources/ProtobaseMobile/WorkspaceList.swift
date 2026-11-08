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

    /** Every listed workspace, in the order added. */
    func all() throws -> [Workspace] {
        guard let data = defaults.data(forKey: Self.listKey) else { return [] }
        return try JSONDecoder().decode([Workspace].self, from: data)
    }

    /** The workspace with `id`; throws `.unknown` when none has it. */
    func find(_ id: String) throws -> Workspace {
        guard let workspace = try all().first(where: { $0.id == id }) else { throw Failure.unknown }
        return workspace
    }

    /** Lists a workspace under a new id; throws `.listed` when one already has the origin. */
    func add(origin: URL, name: String?, icon: String?) throws -> Workspace {
        let workspaces = try all()
        guard !workspaces.contains(where: { $0.origin == origin.absoluteString }) else { throw Failure.listed }
        let workspace = Workspace(id: UUID().uuidString, origin: origin.absoluteString, name: name, icon: icon)
        try save(workspaces + [workspace])
        return workspace
    }

    /** Drops the workspace and keeps its id in `removedStores`; throws `.unknown` when none has it. */
    func remove(_ id: String) throws {
        let workspaces = try all()
        guard workspaces.contains(where: { $0.id == id }) else { throw Failure.unknown }
        defaults.set(removedStores() + [id], forKey: Self.removedKey)
        try save(workspaces.filter { $0.id != id })
    }

    /** The ids of removed workspaces whose data stores are not deleted yet. */
    func removedStores() -> [String] {
        defaults.stringArray(forKey: Self.removedKey) ?? []
    }

    /** Forgets a removed workspace's id once its data store is deleted. */
    func storeRemoved(_ id: String) {
        defaults.set(removedStores().filter { $0 != id }, forKey: Self.removedKey)
    }

    /** Writes the whole list. */
    private func save(_ workspaces: [Workspace]) throws {
        defaults.set(try JSONEncoder().encode(workspaces), forKey: Self.listKey)
    }
}
