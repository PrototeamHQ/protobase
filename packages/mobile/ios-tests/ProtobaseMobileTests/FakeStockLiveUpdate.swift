import Capacitor

/** Stands in for the stock live updater: answers every stock method by recording what it was called with. */
@objc(FakeStockLiveUpdate)
final class FakeStockLiveUpdate: CAPPlugin, CAPBridgedPlugin {
    let identifier = "LiveUpdatePlugin"
    let jsName = "LiveUpdate"
    let pluginMethods = LiveUpdateStockNames.all.map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise)! }

    private(set) var calls: [(method: String, options: [AnyHashable: Any])] = []
    private(set) var loaded = false

    override func load() {
        loaded = true
    }

    private func record(_ call: CAPPluginCall) {
        calls.append((call.methodName, call.options))
        call.resolve()
    }

    @objc func clearBlockedBundles(_ call: CAPPluginCall) { record(call) }
    @objc func deleteBundle(_ call: CAPPluginCall) { record(call) }
    @objc func downloadBundle(_ call: CAPPluginCall) { record(call) }
    @objc func fetchChannels(_ call: CAPPluginCall) { record(call) }
    @objc func fetchLatestBundle(_ call: CAPPluginCall) { record(call) }
    @objc func getBlockedBundles(_ call: CAPPluginCall) { record(call) }
    @objc func getBundles(_ call: CAPPluginCall) { record(call) }
    @objc func getChannel(_ call: CAPPluginCall) { record(call) }
    @objc func getConfig(_ call: CAPPluginCall) { record(call) }
    @objc func getDownloadedBundles(_ call: CAPPluginCall) { record(call) }
    @objc func getCurrentBundle(_ call: CAPPluginCall) { record(call) }
    @objc func getCustomId(_ call: CAPPluginCall) { record(call) }
    @objc func getDeviceId(_ call: CAPPluginCall) { record(call) }
    @objc func getNextBundle(_ call: CAPPluginCall) { record(call) }
    @objc func getVersionCode(_ call: CAPPluginCall) { record(call) }
    @objc func getVersionName(_ call: CAPPluginCall) { record(call) }
    @objc func isSyncing(_ call: CAPPluginCall) { record(call) }
    @objc func ready(_ call: CAPPluginCall) { record(call) }
    @objc func reload(_ call: CAPPluginCall) { record(call) }
    @objc func reset(_ call: CAPPluginCall) { record(call) }
    @objc func resetConfig(_ call: CAPPluginCall) { record(call) }
    @objc func setChannel(_ call: CAPPluginCall) { record(call) }
    @objc func setConfig(_ call: CAPPluginCall) { record(call) }
    @objc func setCustomId(_ call: CAPPluginCall) { record(call) }
    @objc func setNextBundle(_ call: CAPPluginCall) { record(call) }
    @objc func sync(_ call: CAPPluginCall) { record(call) }
}

/** Capawesome's LiveUpdatePlugin.swift 8.7.1, pluginMethods. */
enum LiveUpdateStockNames {
    static let all = [
        "clearBlockedBundles", "deleteBundle", "downloadBundle", "fetchChannels", "fetchLatestBundle", "getBlockedBundles", "getBundles", "getChannel",
        "getConfig", "getDownloadedBundles", "getCurrentBundle", "getCustomId", "getDeviceId", "getNextBundle", "getVersionCode", "getVersionName",
        "isSyncing", "ready", "reload", "reset", "resetConfig", "setChannel", "setConfig", "setCustomId", "setNextBundle", "sync",
    ]
}
