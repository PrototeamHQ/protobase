import XCTest
@testable import ProtobaseMobile

final class LiveUpdateLoadCheckTests: XCTestCase {
    private let good = LiveUpdateSettings(
        autoUpdateStrategy: "none", autoDeleteBundles: true, autoBlockRolledBackBundles: true, readyTimeout: 10000, releasesUrl: nil, publicKey: nil,
        fingerprint: nil, shellVersion: nil, builtInOrder: nil)

    private func refusal(_ settings: LiveUpdateSettings, stockMethods: [String]? = LiveUpdateMethods.declared, responds: Bool = true) -> String? {
        LiveUpdateLoadCheck.refusal(settings, stockMethods: stockMethods, stockResponds: { _ in responds })
    }

    func testLoadsWithTheRequiredSettings() {
        XCTAssertNil(refusal(good))
    }

    func testRefusesEachSetting() {
        var background = good
        background.autoUpdateStrategy = "background"
        XCTAssertEqual(refusal(background), "plugins.LiveUpdate.autoUpdateStrategy must be \"none\" in a Protobase app")
        var kept = good
        kept.autoDeleteBundles = false
        XCTAssertEqual(refusal(kept), "plugins.LiveUpdate.autoDeleteBundles must be true in a Protobase app")
        var untimed = good
        untimed.readyTimeout = 0
        XCTAssertEqual(refusal(untimed), "plugins.LiveUpdate.readyTimeout must be above 0 in a Protobase app")
    }

    func testRefusesAStockMethodWithNoGuard() {
        XCTAssertEqual(refusal(good, stockMethods: LiveUpdateMethods.declared + ["setUpdateUrl"]), "LiveUpdate.setUpdateUrl has no guard in this Protobase app")
    }

    func testRefusesWithoutTheStockPluginOrAForwardedMethod() {
        XCTAssertEqual(refusal(good, stockMethods: nil), "LiveUpdate has no stock LiveUpdatePlugin in this Protobase app")
        XCTAssertEqual(refusal(good, responds: false), "LiveUpdate.ready is missing from the stock LiveUpdatePlugin")
    }

    func testSortsEveryStockMethodAndForwardsExactlyTheShellsEight() {
        XCTAssertEqual(Set(LiveUpdateMethods.declared), Set(LiveUpdateStockNames.all))
        XCTAssertEqual(LiveUpdateMethods.declared.count, 26)
        XCTAssertEqual(Set(LiveUpdateMethods.forwarded), ["ready", "reload", "getCurrentBundle", "getNextBundle", "getDownloadedBundles", "getVersionCode", "getVersionName", "setNextBundle"])
        XCTAssertEqual(LiveUpdateMethods.own, ["downloadBundle"])
        XCTAssertEqual(LiveUpdateMethods.refused.count, 17)
    }

    func testPinsWhatTheGuardTakesAReleaseBy() throws {
        let app = TestApp()
        let pins = try LiveUpdatePins.make(app.settings, appId: TestRelease.appId).get()
        XCTAssertEqual(pins.builtInOrder, [1000])
        XCTAssertEqual(pins.binary.appId, TestRelease.appId)
        func reason(_ change: (inout LiveUpdateSettings) -> Void) -> String? {
            var settings = app.settings
            change(&settings)
            guard case .failure(let refusal) = LiveUpdatePins.make(settings, appId: TestRelease.appId) else { return nil }
            return refusal.reason
        }
        XCTAssertEqual(reason { $0.autoBlockRolledBackBundles = false }, "plugins.LiveUpdate.autoBlockRolledBackBundles must be true in a Protobase app")
        XCTAssertEqual(reason { $0.publicKey = TestKey.ecPem() }, "plugins.LiveUpdate.publicKey must be an RSA public key in a Protobase app")
        XCTAssertEqual(reason { $0.fingerprint = "ABCDEF0123456789" }, "plugins.LiveUpdate needs the binary's fingerprint and shellVersion in a Protobase app: run protobase mobile again")
        XCTAssertEqual(reason { $0.builtInOrder = "x" }, "plugins.LiveUpdate needs the order of the binary's own files, builtInOrder, in a Protobase app: run protobase mobile again")
        XCTAssertEqual(reason { $0.releasesUrl = "https://api.example.com/releases?x=1" }, "plugins.LiveUpdate.releasesUrl must be an https URL, or http to the device itself, in a Protobase app")
    }
}
