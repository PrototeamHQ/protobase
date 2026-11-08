import WebKit

/**
 * A workspace's own WKWebView: on the data store its id names, so its cookies, storage and cache are its own; with no
 * Capacitor bridge, only WorkspaceChannel; held to WorkspaceNavigation; and with `ProtobaseApp/1` at the end of its
 * user agent, as Capacitor appends `appendUserAgent`, so the page can tell it runs in the shell. None below iOS 17,
 * which has no data store but the app's own.
 */
final class WorkspaceWebView {
    static let userAgentToken = "ProtobaseApp/1"

    let workspace: Workspace
    let origin: URL
    let webView: WKWebView
    // The WebView holds its navigation and UI delegates weakly.
    private let delegate: WorkspaceNavigationDelegate

    init?(_ workspace: Workspace, openExternally: @escaping (URL) -> Void, onMessage: @escaping (WorkspaceMessage) -> Void) {
        guard #available(iOS 17.0, *), let store = UUID(uuidString: workspace.id), let origin = WorkspaceOrigin.parse(workspace.origin) else { return nil }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = WKWebsiteDataStore(forIdentifier: store)
        configuration.applicationNameForUserAgent = [configuration.applicationNameForUserAgent, Self.userAgentToken].compactMap { $0 }.joined(separator: " ")
        configuration.userContentController.add(WorkspaceChannel(workspace: origin, onMessage: onMessage), name: WorkspaceMessage.handlerName)
        self.workspace = workspace
        self.origin = origin
        self.delegate = WorkspaceNavigationDelegate(workspace: origin, openExternally: openExternally)
        self.webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = delegate
        webView.uiDelegate = delegate
        webView.allowsBackForwardNavigationGestures = true
    }

    /** Loads the workspace's origin. */
    func load() {
        webView.load(URLRequest(url: origin))
    }

    /** Stops the page and lets go of the channel, which the content controller holds strongly. */
    func close() {
        webView.stopLoading()
        webView.configuration.userContentController.removeScriptMessageHandler(forName: WorkspaceMessage.handlerName)
        webView.removeFromSuperview()
    }
}
