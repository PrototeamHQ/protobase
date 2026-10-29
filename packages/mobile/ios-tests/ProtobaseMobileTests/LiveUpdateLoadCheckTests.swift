import XCTest
@testable import ProtobaseMobile

final class LiveUpdateLoadCheckTests: XCTestCase {
    private let good = LiveUpdateSettings(autoUpdateStrategy: "none", autoDeleteBundles: true, readyTimeout: 10000, releasesUrl: nil, publicKey: nil)

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

    func testSortsEveryStockMethodAndForwardsExactlyTheShellsNine() {
        XCTAssertEqual(Set(LiveUpdateMethods.declared), Set(LiveUpdateStockNames.all))
        XCTAssertEqual(LiveUpdateMethods.declared.count, 26)
        XCTAssertEqual(Set(LiveUpdateMethods.forwarded), ["ready", "reload", "getCurrentBundle", "getNextBundle", "getDownloadedBundles", "getVersionCode", "getVersionName", "downloadBundle", "setNextBundle"])
        XCTAssertEqual(LiveUpdateMethods.refused.count, 17)
    }
}
