import Foundation

/**
 * A workspace the shell lists: `id`, a UUID minted when it is added, which also names its data store; its origin
 * (WorkspaceOrigin); and the name and icon URL the home view gave it, if any.
 */
struct Workspace: Codable, Equatable {
    let id: String
    let origin: String
    let name: String?
    let icon: String?
}
