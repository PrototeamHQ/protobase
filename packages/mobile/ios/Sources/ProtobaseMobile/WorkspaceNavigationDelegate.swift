import WebKit

/**
 * Holds a workspace view to WorkspaceNavigation: every navigation, redirects included, and every new window, which
 * never opens as a view of its own. A URL for the system browser goes to `openExternally`.
 */
final class WorkspaceNavigationDelegate: NSObject, WKNavigationDelegate, WKUIDelegate {
    private let workspace: URL
    private let openExternally: (URL) -> Void

    init(workspace: URL, openExternally: @escaping (URL) -> Void) {
        self.workspace = workspace
        self.openExternally = openExternally
    }

    /** Allows what WorkspaceNavigation loads, hands a URL for the system browser to `openExternally` and cancels the rest. */
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let mainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        decisionHandler(decide(navigationAction, mainFrame: mainFrame) == .load ? .allow : .cancel)
    }

    /** Opens no window: a `target=_blank` link or `window.open` is decided as a main-frame navigation and, when it loads, loads in this view. */
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if decide(navigationAction, mainFrame: true) == .load {
            webView.load(navigationAction.request)
        }
        return nil
    }

    /** WorkspaceNavigation's decision on the action, its method and URL. */
    private func decide(_ action: WKNavigationAction, mainFrame: Bool) -> WorkspaceNavigation.Decision {
        guard let url = action.request.url else { return .refuse }
        let decision = WorkspaceNavigation.decide(url, mainFrame: mainFrame, method: action.request.httpMethod ?? "GET", workspace: workspace)
        if decision == .openExternally { openExternally(url) }
        return decision
    }
}
