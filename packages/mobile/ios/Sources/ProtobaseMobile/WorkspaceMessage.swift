import Foundation

/**
 * What a workspace page may ask of the shell, posted as a string to `window.webkit.messageHandlers.protobaseApp`.
 * Taken only from the main frame of the workspace's own origin; anything else, or any other frame, is refused.
 */
enum WorkspaceMessage: String {
    /** The page's workspace button: show the workspace list. */
    case openDrawer

    static let handlerName = "protobaseApp"

    /** The message `body` names, when it comes from the main frame of the workspace's origin; otherwise nil. */
    static func accept(_ body: Any, mainFrame: Bool, scheme: String, host: String, port: Int, workspace: URL) -> WorkspaceMessage? {
        guard mainFrame, SameOrigin.matches(scheme: scheme, host: host, port: port, workspace), let text = body as? String else { return nil }
        return WorkspaceMessage(rawValue: text)
    }
}
