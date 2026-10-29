import Capacitor

/**
 * Takes the stock live updater's (8.7.1) place, so page script cannot steer it. The stock class is `public`, not
 * `open`, so it cannot be subclassed here; the CLI lists this class instead of it in capacitor.config.json, and this
 * plugin holds the stock one unregistered (StockLiveUpdate). Capacitor dispatches only the methods a plugin's own
 * `pluginMethods` names (CapacitorBridge.swift, handleJSCall), so this list, every stock method, decides what page
 * script reaches; page script's input never reaches the stock code, which gets a new call with what the guard built.
 *
 * - The methods the shell needs that take no input get none.
 * - downloadBundle: see LiveUpdateDownload and DownloadBudget.
 * - setNextBundle takes null, which resets to the built-in bundle, or an id naming a bundle (BundlesFolder.isBundleId):
 *   the stock code joins ids to its path unchecked (LiveUpdate.swift, buildBundleURLFor).
 * - Everything else is refused, and so is every method when load() refuses to load (LiveUpdateLoadCheck): the stock
 *   plugin then never loads.
 */
@objc(GuardedLiveUpdatePlugin)
public class GuardedLiveUpdatePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GuardedLiveUpdatePlugin"
    public let jsName = "LiveUpdate"
    public let pluginMethods = LiveUpdateMethods.declared.map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise)! }

    private var stock: StockLiveUpdate?
    private var settings: LiveUpdateSettings?

    override public func load() {
        start(LiveUpdateSettings(getConfig()), StockLiveUpdate.make())
    }

    func start(_ settings: LiveUpdateSettings, _ stock: StockLiveUpdate?) {
        if let reason = LiveUpdateLoadCheck.refusal(settings, stockMethods: stock?.methodNames, stockResponds: { stock?.responds(to: $0) ?? false }) {
            CAPLog.print("⚡️ ", reason)
            return
        }
        guard let stock else { return }
        stock.load(guardedBy: self)
        self.settings = settings
        self.stock = stock
    }

    private func refuse(_ call: CAPPluginCall) {
        Refusal.reject(call, plugin: jsName)
    }

    private func forwardCleared(_ call: CAPPluginCall) {
        guard let stock else { return refuse(call) }
        stock.forward(call, call.methodName, options: [:])
    }

    // Checked

    @objc func downloadBundle(_ call: CAPPluginCall) {
        guard let stock, let settings, let options = LiveUpdateDownload.options(call.options, settings) else { return refuse(call) }
        guard DownloadBudget.shared.take() else { return call.reject("LiveUpdate.downloadBundle was called too often in this run of the app") }
        stock.forward(call, "downloadBundle", options: options)
    }

    @objc func setNextBundle(_ call: CAPPluginCall) {
        guard let stock else { return refuse(call) }
        let bundleId = call.options["bundleId"]
        if bundleId == nil || bundleId is NSNull { return stock.forward(call, "setNextBundle", options: [:]) }
        guard let bundleId = bundleId as? String, BundlesFolder.isBundleId(bundleId) else { return refuse(call) }
        stock.forward(call, "setNextBundle", options: ["bundleId": bundleId])
    }

    // Cleared

    @objc func ready(_ call: CAPPluginCall) { forwardCleared(call) }
    @objc func reload(_ call: CAPPluginCall) { forwardCleared(call) }
    @objc func getCurrentBundle(_ call: CAPPluginCall) { forwardCleared(call) }
    @objc func getNextBundle(_ call: CAPPluginCall) { forwardCleared(call) }
    @objc func getDownloadedBundles(_ call: CAPPluginCall) { forwardCleared(call) }
    @objc func getVersionCode(_ call: CAPPluginCall) { forwardCleared(call) }
    @objc func getVersionName(_ call: CAPPluginCall) { forwardCleared(call) }

    // Refused

    @objc func clearBlockedBundles(_ call: CAPPluginCall) { refuse(call) }
    @objc func deleteBundle(_ call: CAPPluginCall) { refuse(call) }
    @objc func fetchChannels(_ call: CAPPluginCall) { refuse(call) }
    @objc func fetchLatestBundle(_ call: CAPPluginCall) { refuse(call) }
    @objc func getBlockedBundles(_ call: CAPPluginCall) { refuse(call) }
    @objc func getBundles(_ call: CAPPluginCall) { refuse(call) }
    @objc func getChannel(_ call: CAPPluginCall) { refuse(call) }
    @objc func getConfig(_ call: CAPPluginCall) { refuse(call) }
    @objc func getCustomId(_ call: CAPPluginCall) { refuse(call) }
    @objc func getDeviceId(_ call: CAPPluginCall) { refuse(call) }
    @objc func isSyncing(_ call: CAPPluginCall) { refuse(call) }
    @objc func reset(_ call: CAPPluginCall) { refuse(call) }
    @objc func resetConfig(_ call: CAPPluginCall) { refuse(call) }
    @objc func setChannel(_ call: CAPPluginCall) { refuse(call) }
    @objc func setConfig(_ call: CAPPluginCall) { refuse(call) }
    @objc func setCustomId(_ call: CAPPluginCall) { refuse(call) }
    @objc func sync(_ call: CAPPluginCall) { refuse(call) }
}
