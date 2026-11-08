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

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let mainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        decisionHandler(decide(navigationAction, mainFrame: mainFrame) == .load ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if decide(navigationAction, mainFrame: true) == .load {
            webView.load(navigationAction.request)
        }
        return nil
    }

    private func decide(_ action: WKNavigationAction, mainFrame: Bool) -> WorkspaceNavigation.Decision {
        guard let url = action.request.url else { return .refuse }
        let decision = WorkspaceNavigation.decide(url, mainFrame: mainFrame, method: action.request.httpMethod ?? "GET", workspace: workspace)
        if decision == .openExternally { openExternally(url) }
        return decision
    }
}
