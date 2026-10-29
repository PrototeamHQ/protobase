import Capacitor

/**
 * Takes the stock live updater's (8.7.1) place, so page script cannot steer it. The stock class is `public`, not
 * `open`, so it cannot be subclassed here; the CLI lists this class instead of it in capacitor.config.json, and this
 * plugin holds the stock one unregistered (StockLiveUpdate). Capacitor dispatches only the methods a plugin's own
 * `pluginMethods` names (CapacitorBridge.swift, handleJSCall), so this list, every stock method, decides what page
 * script reaches; page script's input never reaches the stock code, which gets a new call with what the guard built.
 *
 * - The methods the shell needs that take no input get none.
 * - downloadBundle takes only a manifest from the app's own releases URL, `releasesUrl + "/" + bundleId`, and the guard
 *   downloads it itself (LiveUpdateGuard, ReleaseDownload), bound by the release's statement to the id, the pinned
 *   `publicKey`, this binary and its order. A few per run of the app (DownloadBudget).
 * - Both take a release only above the order of the binary's own files, `builtInOrder`, and neither takes a bundle the
 *   stock code blocked after rolling it back (BlockedBundles), which it checks only in the refused sync().
 * - setNextBundle takes an id naming a bundle (BundlesFolder.isBundleId), checks it on disk (BundleCheck) and takes it
 *   only above the running bundle's order and not below the highest the app downloaded. It is the only way to a
 *   downloaded bundle: null, which the stock code takes for the built-in files, reset, sync and the rest are refused.
 * - Everything else is refused, and so is every method when load() refuses to load (LiveUpdateLoadCheck,
 *   LiveUpdatePins): the stock plugin then never loads.
 */
@objc(GuardedLiveUpdatePlugin)
public class GuardedLiveUpdatePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GuardedLiveUpdatePlugin"
    public let jsName = "LiveUpdate"
    public let pluginMethods = LiveUpdateMethods.declared.map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise)! }

    // One download at a time.
    private static let downloads = DispatchQueue(label: "net.protobase.mobile.live-update-downloads")

    private var stock: StockLiveUpdate?
    private var guarded: LiveUpdateGuard?

    override public func load() {
        start(LiveUpdateSettings(getConfig()), StockLiveUpdate.make(), appId: Bundle.main.bundleIdentifier, environment: appEnvironment)
    }

    func start(_ settings: LiveUpdateSettings, _ stock: StockLiveUpdate?, appId: String?, environment: (LiveUpdatePins) -> LiveUpdateGuard.Environment) {
        if let reason = LiveUpdateLoadCheck.refusal(settings, stockMethods: stock?.methodNames, stockResponds: { stock?.responds(to: $0) ?? false }) {
            CAPLog.print("⚡️ ", reason)
            return
        }
        let pins: LiveUpdatePins
        switch LiveUpdatePins.make(settings, appId: appId) {
        case .failure(let refusal):
            CAPLog.print("⚡️ ", refusal.reason)
            return
        case .success(let made):
            pins = made
        }
        guard let stock else { return }
        let guarded = LiveUpdateGuard(pins: pins, environment: environment(pins))
        guarded.clearDownloads()
        stock.load(guardedBy: self)
        self.guarded = guarded
        self.stock = stock
    }

    // Where the stock code keeps bundles and the next one (LiveUpdate.swift, bundlesDirectory and defaultServerPathKey)
    // and Capacitor its built-in files (CAPBridgeViewController.swift, the `public` folder of the app's bundle).
    private func appEnvironment(_ pins: LiveUpdatePins) -> LiveUpdateGuard.Environment {
        LiveUpdateGuard.Environment(
            bundles: BundlesFolder.path,
            downloads: NSHomeDirectory() + "/Library/NoCloud/protobase_live_update_downloads",
            builtInFiles: Bundle.main.bundlePath + "/public",
            defaults: .standard,
            currentPath: { [weak self] in self?.serverBasePath() },
            nextPath: { KeyValueStore.standard["serverBasePath", as: String.self] },
            source: ReleaseFetch(releasesUrl: pins.releasesUrl))
    }

    private func serverBasePath() -> String? {
        if Thread.isMainThread { return MainActor.assumeIsolated { readServerBasePath() } }
        return DispatchQueue.main.sync { MainActor.assumeIsolated { readServerBasePath() } }
    }

    @MainActor private func readServerBasePath() -> String? {
        (bridge?.viewController as? CAPBridgeViewController)?.getServerBasePath()
    }

    private func refuse(_ call: CAPPluginCall) {
        Refusal.reject(call, plugin: jsName)
    }

    private func forwardCleared(_ call: CAPPluginCall) {
        guard let stock else { return refuse(call) }
        stock.forward(call, call.methodName, options: [:])
    }

    // Guarded

    @objc func downloadBundle(_ call: CAPPluginCall) {
        guard stock != nil, let guarded, let bundleId = LiveUpdateDownload.bundleId(call.options, releasesUrl: guarded.pins.releasesUrl) else { return refuse(call) }
        if guarded.isBlocked(bundleId) { return call.reject("LiveUpdate.downloadBundle refused release \(bundleId): it was rolled back") }
        guard DownloadBudget.shared.take() else { return call.reject("LiveUpdate.downloadBundle was called too often in this run of the app") }
        Self.downloads.async {
            do {
                try guarded.download(bundleId)
                call.resolve()
            } catch let refused as BundleRefused {
                call.reject("LiveUpdate.downloadBundle refused release \(bundleId): \(refused.reason)")
            } catch {
                call.reject("LiveUpdate.downloadBundle could not download release \(bundleId)")
            }
        }
    }

    @objc func setNextBundle(_ call: CAPPluginCall) {
        guard let stock, let guarded, let bundleId = call.options["bundleId"] as? String, BundlesFolder.isBundleId(bundleId, in: guarded.environment.bundles) else {
            return refuse(call)
        }
        do {
            try guarded.setNext(bundleId) { stock.forward(call, "setNextBundle", options: ["bundleId": bundleId]) }
        } catch let refused as BundleRefused {
            call.reject("LiveUpdate.setNextBundle refused bundle \(bundleId): \(refused.reason)")
        } catch {
            call.reject("LiveUpdate.setNextBundle could not check bundle \(bundleId)")
        }
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
