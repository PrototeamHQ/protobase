import Capacitor
import XCTest
@testable import ProtobaseMobile

final class GuardedLiveUpdatePluginTests: XCTestCase {
    private let releases = "https://api.example.com/api/mobile/releases"
    private lazy var settings = LiveUpdateSettings(autoUpdateStrategy: "none", autoDeleteBundles: true, readyTimeout: 10000, releasesUrl: releases, publicKey: "key")
    private var fake = FakeStockLiveUpdate()
    private var plugin = GuardedLiveUpdatePlugin()

    private func started(_ settings: LiveUpdateSettings? = nil) -> GuardedLiveUpdatePlugin {
        plugin.start(settings ?? self.settings, StockLiveUpdate(plugin: fake))
        return plugin
    }

    // The error message the call ends with, or nil when it resolved.
    private func call(_ method: String, _ options: [String: Any] = [:]) -> String? {
        var error: String?
        let call = CAPPluginCall(callbackId: "1", methodName: method, options: options, success: { _, _ in }, error: { error = $0?.message ?? "" })!
        plugin.perform(NSSelectorFromString(method + ":"), with: call)
        return error
    }

    func testDeclaresEveryStockMethodAndNothingElse() {
        XCTAssertEqual(plugin.pluginMethods.map(\.name).sorted(), LiveUpdateStockNames.all.sorted())
        for name in LiveUpdateStockNames.all {
            XCTAssertTrue(plugin.responds(to: NSSelectorFromString(name + ":")), name)
        }
    }

    func testRefusesEveryOtherStockMethodWithoutRunningIt() {
        _ = started()
        for method in LiveUpdateMethods.refused {
            XCTAssertEqual(call(method, ["bundleId": "b1", "channel": "beta", "customId": "x", "appId": "x"]), "LiveUpdate.\(method) is not available to page script in a Protobase app")
        }
        XCTAssertTrue(fake.calls.isEmpty)
    }

    func testForwardsTheClearedMethodsWithNoInput() {
        _ = started()
        for method in LiveUpdateMethods.cleared {
            XCTAssertNil(call(method, ["bundleId": "b1", "url": "https://attacker.example/x", "autoUpdateStrategy": "background"]), method)
        }
        XCTAssertEqual(fake.calls.map(\.method), LiveUpdateMethods.cleared)
        XCTAssertTrue(fake.calls.allSatisfy { $0.options.isEmpty })
    }

    func testRefusesEveryMethodWhenItRefusedToLoad() {
        var background = settings
        background.autoUpdateStrategy = "background"
        _ = started(background)
        XCTAssertFalse(fake.loaded)
        for method in LiveUpdateStockNames.all {
            XCTAssertEqual(call(method, ["artifactType": "manifest", "bundleId": "b1", "url": releases + "/b1"]), "LiveUpdate.\(method) is not available to page script in a Protobase app")
        }
        XCTAssertTrue(fake.calls.isEmpty)
    }

    func testLoadsTheStockPluginUnderItsOwnNameForTheConfig() {
        plugin.pluginName = "LiveUpdate"
        _ = started()
        XCTAssertTrue(fake.loaded)
        XCTAssertEqual(fake.pluginName, "LiveUpdate")
    }

    func testDownloadsOnlyWhatItBuiltAndRefusesTheRest() {
        _ = started()
        XCTAssertEqual(call("downloadBundle", ["artifactType": "manifest", "bundleId": "../b1", "url": releases + "/../b1"]), "LiveUpdate.downloadBundle is not available to page script in a Protobase app")
        XCTAssertEqual(call("downloadBundle", ["artifactType": "manifest", "bundleId": "b1", "url": "https://attacker.example/b1"]), "LiveUpdate.downloadBundle is not available to page script in a Protobase app")
        XCTAssertTrue(fake.calls.isEmpty)
        XCTAssertNil(call("downloadBundle", ["artifactType": "manifest", "bundleId": "b1", "url": releases + "/b1", "publicKey": "x", "checksum": "x", "signature": "x"]))
        XCTAssertEqual(fake.calls.map(\.method), ["downloadBundle"])
        XCTAssertEqual(fake.calls.first?.options as? [String: String], ["artifactType": "manifest", "bundleId": "b1", "url": releases + "/b1"])
    }

    func testSetsOnlyNullOrAnExistingBundle() throws {
        _ = started()
        let bundle = BundlesFolder.path + "/b1"
        try FileManager.default.createDirectory(atPath: bundle, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(atPath: bundle) }
        for id: Any in ["..", "../b1", "B1", "missing", "", 1] {
            XCTAssertEqual(call("setNextBundle", ["bundleId": id]), "LiveUpdate.setNextBundle is not available to page script in a Protobase app", "\(id)")
        }
        XCTAssertTrue(fake.calls.isEmpty)
        XCTAssertNil(call("setNextBundle", ["bundleId": "b1", "url": "x"]))
        XCTAssertNil(call("setNextBundle", ["bundleId": NSNull()]))
        XCTAssertNil(call("setNextBundle"))
        XCTAssertEqual(fake.calls.map { $0.options as? [String: String] }, [["bundleId": "b1"], [:], [:]])
    }
}
