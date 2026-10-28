import WebKit

/**
 * Stands in front of the WebView's UI delegate, Capacitor's WebViewDelegationHandler, which answers a JSON `prompt` of
 * type `CapacitorCookies.set` or `CapacitorCookies.get` without a dialog, whether CapacitorCookies is enabled or not,
 * and crashes on a `set` without its fields. Those prompts answer `null`; everything else goes to Capacitor's delegate.
 */
final class CookiePromptFilter: NSObject, WKUIDelegate {
    private static let refusedTypes: Set<String> = ["CapacitorCookies.set", "CapacitorCookies.get"]

    private let original: NSObject & WKUIDelegate

    private init(original: NSObject & WKUIDelegate) {
        self.original = original
    }

    /** Puts the filter in front; the caller keeps it, as the WebView holds its UI delegate weakly. */
    static func install(on webView: WKWebView) -> CookiePromptFilter {
        guard let original = webView.uiDelegate as? NSObject & WKUIDelegate else { fatalError("ProtobaseAuth needs Capacitor's UI delegate on the WebView") }
        let filter = CookiePromptFilter(original: original)
        webView.uiDelegate = filter
        return filter
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        // Parsed as WebViewDelegationHandler.swift parses it.
        if let data = prompt.data(using: .utf8),
           let payload = try? JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed) as? [String: AnyObject],
           let type = payload["type"] as? String,
           Self.refusedTypes.contains(type) {
            completionHandler(nil)
            return
        }
        guard let forward = original.webView(_:runJavaScriptTextInputPanelWithPrompt:defaultText:initiatedByFrame:completionHandler:) else {
            completionHandler(nil)
            return
        }
        forward(webView, prompt, defaultText, frame, completionHandler)
    }

    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || original.responds(to: aSelector)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        original
    }
}
