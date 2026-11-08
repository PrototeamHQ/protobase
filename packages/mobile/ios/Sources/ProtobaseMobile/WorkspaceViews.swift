import UIKit

/**
 * The workspace views in front of the home view, each made the first time its workspace opens and kept until it is
 * removed, so at most one per listed workspace. One shows at a time; the home view shows when none does.
 */
@MainActor
final class WorkspaceViews {
    private let container: () -> UIView?
    private let openExternally: (URL) -> Void
    private let onMessage: (Workspace, WorkspaceMessage) -> Void
    private var views: [String: WorkspaceWebView] = [:]

    init(container: @escaping () -> UIView?, openExternally: @escaping (URL) -> Void, onMessage: @escaping (Workspace, WorkspaceMessage) -> Void) {
        self.container = container
        self.openExternally = openExternally
        self.onMessage = onMessage
    }

    /** The view made for the workspace with `id`, or nil when none is. */
    func view(_ id: String) -> WorkspaceWebView? {
        views[id]
    }

    @discardableResult
    /** Shows the workspace's view in front, making it the first time; false when there is no screen or the view cannot be made. */
    func show(_ workspace: Workspace) -> Bool {
        guard let container = container(), let view = views[workspace.id] ?? make(workspace) else { return false }
        views.values.forEach { $0.webView.isHidden = $0 !== view }
        if view.webView.superview == nil {
            view.webView.frame = container.bounds
            view.webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            container.addSubview(view.webView)
        }
        container.bringSubviewToFront(view.webView)
        return true
    }

    /** Hides every workspace view. */
    func showHome() {
        views.values.forEach { $0.webView.isHidden = true }
    }

    /** Takes the workspace's view off the screen and closes it, if one was made. */
    func close(_ id: String) {
        views.removeValue(forKey: id)?.close()
    }

    /** Makes and loads the workspace's view, or nil when WorkspaceWebView cannot make it. */
    private func make(_ workspace: Workspace) -> WorkspaceWebView? {
        let onMessage = self.onMessage
        guard let view = WorkspaceWebView(workspace, openExternally: openExternally, onMessage: { onMessage(workspace, $0) }) else { return nil }
        views[workspace.id] = view
        view.load()
        return view
    }
}
