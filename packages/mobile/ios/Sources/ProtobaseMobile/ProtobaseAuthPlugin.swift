import Capacitor
import WebKit

/**
 * The shell's sign-in requests (AuthRequest), and what keeps page script away from the session: it filters the
 * bridge's script messages and cookie prompts, and guards the asset handler's local file routes. The bridge loads
 * plugins once the WebView, its delegates and its scheme handler exist and before any page script runs.
 * `apiOrigin` and `origin` come from capacitor.config.json, which the CLI writes outside the app's web part.
 */
@objc(ProtobaseAuthPlugin)
public class ProtobaseAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ProtobaseAuthPlugin"
    public let jsName = "ProtobaseAuth"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise)]

    private var promptFilter: CookiePromptFilter?

    override public func load() {
        guard let bridge = bridge as? CapacitorBridge, let webView = bridge.webView else { fatalError("ProtobaseAuth needs Capacitor's own bridge and WebView") }
        GuardedAssetHandler.install(on: bridge.webViewAssetHandler, LocalFileGuard(basePath: bridge.config.appLocation.path))
        PageScriptFilter.install(on: bridge)
        promptFilter = CookiePromptFilter.install(on: webView)
    }

    @objc func request(_ call: CAPPluginCall) {
        AuthRequest.send(call, config: getConfig(), capConfig: bridge?.config)
    }
}
