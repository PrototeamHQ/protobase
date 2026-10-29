import XCTest
@testable import ProtobaseMobile

final class LiveUpdateDownloadTests: XCTestCase {
    private let releases = "https://api.example.com/api/mobile/releases"
    private lazy var settings = LiveUpdateSettings(autoUpdateStrategy: "none", autoDeleteBundles: true, readyTimeout: 10000, releasesUrl: releases, publicKey: "key")

    private func call(_ bundleId: String) -> [AnyHashable: Any] {
        ["artifactType": "manifest", "bundleId": bundleId, "url": releases + "/" + bundleId]
    }

    func testKeepsOnlyTheThreeOptionsItBuilt() {
        var input = call("b1")
        input["publicKey"] = "attacker"
        input["checksum"] = "attacker"
        input["signature"] = "attacker"
        let options = LiveUpdateDownload.options(input, settings)
        XCTAssertEqual(options as? [String: String], ["artifactType": "manifest", "bundleId": "b1", "url": releases + "/b1"])
    }

    func testRefusesBundleIdsWithUrlMetacharacters() {
        for id in ["../b1", "%2e%2e", "/b1", "b1/../x", "https://attacker.example/x", "x?y", "x#y", "@evil.com", "a.b", ""] {
            XCTAssertNil(LiveUpdateDownload.options(call(id), settings), id)
        }
    }

    func testRefusesAnotherUrlTypeOrMissingInput() {
        XCTAssertNil(LiveUpdateDownload.options(["artifactType": "manifest", "bundleId": "b1", "url": "https://attacker.example/b1"], settings))
        XCTAssertNil(LiveUpdateDownload.options(["artifactType": "manifest", "bundleId": "b1", "url": releases + "/b1/"], settings))
        XCTAssertNil(LiveUpdateDownload.options(["artifactType": "zip", "bundleId": "b1", "url": releases + "/b1"], settings))
        XCTAssertNil(LiveUpdateDownload.options(["bundleId": "b1", "url": releases + "/b1"], settings))
        XCTAssertNil(LiveUpdateDownload.options(["artifactType": "manifest", "bundleId": 1, "url": releases + "/1"], settings))
    }

    func testRefusesWithoutAPinnedKeyOrOwnReleasesUrl() {
        var unpinned = settings
        unpinned.publicKey = " "
        XCTAssertNil(LiveUpdateDownload.options(call("b1"), unpinned))
        var foreign = settings
        foreign.releasesUrl = "http://api.example.com/releases"
        XCTAssertNil(LiveUpdateDownload.options(["artifactType": "manifest", "bundleId": "b1", "url": "http://api.example.com/releases/b1"], foreign))
        foreign.releasesUrl = nil
        XCTAssertNil(LiveUpdateDownload.options(call("b1"), foreign))
    }

    func testBudgetTakesItsLimitEvenUnderConcurrentCalls() {
        let budget = DownloadBudget(limit: 3)
        let taken = NSLock()
        var count = 0
        DispatchQueue.concurrentPerform(iterations: 100) { _ in
            guard budget.take() else { return }
            taken.lock()
            count += 1
            taken.unlock()
        }
        XCTAssertEqual(count, 3)
        XCTAssertFalse(budget.take())
    }
}
