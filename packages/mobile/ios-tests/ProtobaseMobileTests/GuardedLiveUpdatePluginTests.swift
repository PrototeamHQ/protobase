import Capacitor
import XCTest
@testable import ProtobaseMobile

final class GuardedLiveUpdatePluginTests: XCTestCase {
    private let app = TestApp()
    private var fake = FakeStockLiveUpdate()
    private var plugin = GuardedLiveUpdatePlugin()
    private var releases: String { app.settings.releasesUrl! }

    private func started(_ settings: LiveUpdateSettings? = nil) -> GuardedLiveUpdatePlugin {
        plugin.start(settings ?? app.settings, StockLiveUpdate(plugin: fake), appId: TestRelease.appId, environment: app.environment)
        return plugin
    }

    // The error message the call ends with, or nil when it resolved.
    private func call(_ method: String, _ options: [String: Any] = [:]) -> String? {
        var error: String?
        let answered = expectation(description: method)
        let call = CAPPluginCall(callbackId: "1", methodName: method, options: options, success: { _, _ in answered.fulfill() }, error: {
            error = $0?.message ?? ""
            answered.fulfill()
        })!
        plugin.perform(NSSelectorFromString(method + ":"), with: call)
        wait(for: [answered], timeout: 20)
        return error
    }

    private func refused(_ method: String) -> String {
        "LiveUpdate.\(method) is not available to page script in a Protobase app"
    }

    func testDeclaresEveryStockMethodAndNothingElse() {
        XCTAssertEqual(plugin.pluginMethods.map(\.name).sorted(), LiveUpdateStockNames.all.sorted())
        for name in LiveUpdateStockNames.all {
            XCTAssertTrue(plugin.responds(to: NSSelectorFromString(name + ":")), name)
        }
    }

    func testRefusesEveryOtherStockMethodWithoutRunningIt() {
        _ = started()
        XCTAssertTrue(Set(["sync", "reset", "deleteBundle", "clearBlockedBundles"]).isSubset(of: LiveUpdateMethods.refused))
        for method in LiveUpdateMethods.refused {
            XCTAssertEqual(call(method, ["bundleId": "b1", "channel": "beta", "customId": "x", "appId": "x"]), refused(method))
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

    // Security case 17, and every method refused once it refused to load.
    func testRefusesEveryMethodWhenItRefusedToLoad() {
        var refusals: [(LiveUpdateSettings) -> LiveUpdateSettings] = [
            { var s = $0; s.autoUpdateStrategy = "background"; return s },
            { var s = $0; s.autoBlockRolledBackBundles = false; return s },
            { var s = $0; s.releasesUrl = nil; return s },
            { var s = $0; s.releasesUrl = "http://api.example.com/releases"; return s },
            { var s = $0; s.publicKey = nil; return s },
            { var s = $0; s.publicKey = TestKey.ecPem(); return s },
            { var s = $0; s.publicKey = "garbage"; return s },
            { var s = $0; s.fingerprint = nil; return s },
            { var s = $0; s.shellVersion = "1.0"; return s },
            { var s = $0; s.builtInOrder = nil; return s },
            { var s = $0; s.builtInOrder = "0"; return s },
        ]
        refusals.append { var s = $0; s.shellVersion = nil; return s }
        for change in refusals {
            fake = FakeStockLiveUpdate()
            plugin = GuardedLiveUpdatePlugin()
            _ = started(change(app.settings))
            XCTAssertFalse(fake.loaded)
            for method in LiveUpdateStockNames.all {
                XCTAssertEqual(call(method, ["artifactType": "manifest", "bundleId": "b1", "url": releases + "/b1"]), refused(method))
            }
            XCTAssertTrue(fake.calls.isEmpty)
            XCTAssertTrue(app.source.requests.isEmpty)
        }
    }

    func testRefusesToLoadWithoutTheAppsBundleIdentifier() {
        plugin.start(app.settings, StockLiveUpdate(plugin: fake), appId: nil, environment: app.environment)
        XCTAssertFalse(fake.loaded)
    }

    func testLoadsTheStockPluginUnderItsOwnNameForTheConfig() {
        plugin.pluginName = "LiveUpdate"
        _ = started()
        XCTAssertTrue(fake.loaded)
        XCTAssertEqual(fake.pluginName, "LiveUpdate")
    }

    func testDownloadsItselfAndRefusesWhatItDidNotBuild() {
        _ = started()
        let release = app.release(["index.html": bytes("x")], order: [2000])
        XCTAssertEqual(call("downloadBundle", ["artifactType": "manifest", "bundleId": "../b1", "url": releases + "/../b1"]), refused("downloadBundle"))
        XCTAssertEqual(call("downloadBundle", ["artifactType": "manifest", "bundleId": release.bundleId, "url": "https://attacker.example/" + release.bundleId]), refused("downloadBundle"))
        XCTAssertTrue(app.source.requests.isEmpty)
        XCTAssertNil(call("downloadBundle", ["artifactType": "manifest", "bundleId": release.bundleId, "url": releases + "/" + release.bundleId, "publicKey": "x", "checksum": "x", "signature": "x"]))
        XCTAssertTrue(app.exists(app.bundle(release.bundleId)))
        XCTAssertTrue(fake.calls.isEmpty, "the stock downloader never runs")
    }

    func testRefusesARolledBackReleaseBeforeAnyRequest() {
        _ = started()
        let release = app.release(["index.html": bytes("x")], order: [2000])
        app.defaults.set(release.bundleId, forKey: BlockedBundles.key)
        XCTAssertEqual(call("downloadBundle", ["artifactType": "manifest", "bundleId": release.bundleId, "url": releases + "/" + release.bundleId]), "LiveUpdate.downloadBundle refused release \(release.bundleId): it was rolled back")
        XCTAssertTrue(app.source.requests.isEmpty)
    }

    // Security case 13: no reset to the built-in files, and only a checked bundle reaches the stock code.
    func testSetsOnlyACheckedBundle() throws {
        _ = started()
        let release = app.release(["index.html": bytes("x")], order: [2000])
        try guardedDownload(release.bundleId)
        for id: Any in ["..", "../b1", release.bundleId.uppercased(), "missing", "", 1, NSNull()] {
            XCTAssertEqual(call("setNextBundle", ["bundleId": id]), refused("setNextBundle"), "\(id)")
        }
        XCTAssertEqual(call("setNextBundle"), refused("setNextBundle"))
        XCTAssertTrue(fake.calls.isEmpty)
        XCTAssertNil(call("setNextBundle", ["bundleId": release.bundleId, "url": "x"]))
        XCTAssertEqual(fake.calls.map { $0.options as? [String: String] }, [["bundleId": release.bundleId]])
    }

    func testRefusesABundleTheCheckRefuses() throws {
        _ = started()
        let release = app.release(["index.html": bytes("x")], order: [2000])
        try guardedDownload(release.bundleId)
        app.write(app.bundle(release.bundleId) + "/planted.js", bytes("x"))
        XCTAssertEqual(call("setNextBundle", ["bundleId": release.bundleId]), "LiveUpdate.setNextBundle refused bundle \(release.bundleId): its folder holds planted.js, which its manifest does not list")
        XCTAssertTrue(fake.calls.isEmpty)
    }

    // Downloads as the plugin would, without spending the run's download budget.
    private func guardedDownload(_ id: String) throws {
        try app.makeGuard().download(id)
    }
}
