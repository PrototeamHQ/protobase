import Capacitor

/**
 * The stock live updater's plugin, held by the guard and never registered with the bridge, so page script reaches it by
 * no name: Capacitor dispatches only to registered plugins, and PageScriptFilter refuses a plugin id the bridge has not
 * registered before Capacitor could load it by class name. Looked up by its `@objc` name, so Protobase's package builds
 * without the live updater's.
 */
final class StockLiveUpdate {
    private static let className = "LiveUpdatePlugin"

    let plugin: CAPPlugin & CAPBridgedPlugin

    init(plugin: CAPPlugin & CAPBridgedPlugin) {
        self.plugin = plugin
    }

    /** The stock plugin, not loaded yet, or nil when the app does not include it. */
    static func make() -> StockLiveUpdate? {
        guard let type = NSClassFromString(className) as? CAPPlugin.Type, let plugin = type.init() as? CAPPlugin & CAPBridgedPlugin else { return nil }
        return StockLiveUpdate(plugin: plugin)
    }

    var methodNames: [String] {
        plugin.pluginMethods.map(\.name)
    }

    func responds(to method: String) -> Bool {
        plugin.responds(to: Self.selector(method))
    }

    /**
     * Loads it as the bridge would (Capacitor's CAPPlugin+LoadInstance.swift), on `guarding`'s bridge, config and
     * listeners, so its events reach the listeners page script added to the guard.
     */
    func load(guardedBy guarding: CAPPlugin & CAPBridgedPlugin) {
        plugin.bridge = guarding.bridge
        plugin.webView = guarding.webView
        plugin.shouldStringifyDatesInCalls = true
        plugin.eventListeners = guarding.eventListeners
        plugin.retainedEventArguments = guarding.retainedEventArguments
        plugin.pluginId = plugin.identifier
        plugin.pluginName = guarding.pluginName
        plugin.load()
    }

    /** Runs `method` as Capacitor would (CapacitorBridge.swift, handleJSCall), on a new call that holds only `options`. */
    func forward(_ call: CAPPluginCall, _ method: String, options: [String: Any]) {
        guard let forwarded = CAPPluginCall(callbackId: call.callbackId, methodName: method, options: options, success: call.successHandler, error: call.errorHandler) else {
            fatalError("Capacitor made no plugin call")
        }
        plugin.perform(Self.selector(method), with: forwarded)
    }

    private static func selector(_ method: String) -> Selector {
        NSSelectorFromString(method + ":")
    }
}
