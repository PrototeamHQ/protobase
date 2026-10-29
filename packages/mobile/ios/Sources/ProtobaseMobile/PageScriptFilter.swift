import Capacitor
import WebKit

/**
 * Stands in front of Capacitor's `bridge` script message handler, the way page script calls native code. It drops
 * messages from any frame but the main one of the app's own origin, as Capacitor Android's MessageHandler does, and
 * refuses `CapacitorHttp`, `CapacitorCookies` and `WebView`, which hand over or plant the session, and any plugin id
 * the bridge has not loaded: Capacitor would otherwise load a plugin by class name, such as `CAPHttpPlugin` or the stock
 * `LiveUpdatePlugin`. `LiveUpdate` passes only when GuardedLiveUpdatePlugin holds the name: an `npx cap sync` lists the
 * stock class again, which then registers under it beside or instead of the guard.
 */
final class PageScriptFilter: NSObject, WKScriptMessageHandler {
    private static let handlerName = "bridge"
    private static let refusedPlugins: Set<String> = ["CapacitorHttp", "CapacitorCookies", "WebView"]

    private weak var bridge: CapacitorBridge?

    private init(bridge: CapacitorBridge) {
        self.bridge = bridge
    }

    static func install(on bridge: CapacitorBridge) {
        let contentController = bridge.webViewDelegationHandler.contentController
        contentController.removeScriptMessageHandler(forName: handlerName)
        contentController.add(PageScriptFilter(bridge: bridge), name: handlerName)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let bridge, message.frameInfo.isMainFrame, isAppOrigin(message.frameInfo.securityOrigin, bridge.config.serverURL) else { return }
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        if type == "js.error" || type == "cordova" {
            bridge.webViewDelegationHandler.userContentController(userContentController, didReceive: message)
            return
        }
        guard type == "message" else { return }
        let pluginId = body["pluginId"] as? String ?? ""
        if !Self.refusedPlugins.contains(pluginId), let plugin = bridge.plugin(withName: pluginId), pluginId != "LiveUpdate" || plugin is GuardedLiveUpdatePlugin {
            bridge.webViewDelegationHandler.userContentController(userContentController, didReceive: message)
            return
        }
        refuse(body, pluginId: pluginId, in: message.webView)
    }

    // Rejects the call's promise, as Capacitor answers a failed call (CapacitorBridge.swift, toJs).
    private func refuse(_ body: [String: Any], pluginId: String, in webView: WKWebView?) {
        guard let callbackId = body["callbackId"] as? String else { return }
        let answer: [String: Any] = [
            "callbackId": callbackId,
            "pluginId": pluginId,
            "methodName": body["methodName"] as? String ?? "",
            "success": false,
            "error": ["message": Refusal.message(pluginId)],
        ]
        guard let json = try? JSONSerialization.data(withJSONObject: answer), let text = String(data: json, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.Capacitor.fromNative(\(text))")
    }

    private func isAppOrigin(_ origin: WKSecurityOrigin, _ serverURL: URL) -> Bool {
        let scheme = (serverURL.scheme ?? "").lowercased()
        let serverPort = serverURL.port ?? defaultPort(scheme)
        let originPort = origin.port == 0 ? defaultPort(origin.protocol.lowercased()) : origin.port
        return origin.protocol.lowercased() == scheme && origin.host.lowercased() == (serverURL.host ?? "").lowercased() && originPort == serverPort
    }

    private func defaultPort(_ scheme: String) -> Int {
        switch scheme {
        case "http": return 80
        case "https": return 443
        default: return 0
        }
    }
}
