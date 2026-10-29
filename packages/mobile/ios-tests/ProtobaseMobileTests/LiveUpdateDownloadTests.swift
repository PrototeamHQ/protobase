import XCTest
@testable import ProtobaseMobile

final class LiveUpdateDownloadTests: XCTestCase {
    private let releases = "https://api.example.com/api/mobile/releases"

    private func call(_ bundleId: String) -> [AnyHashable: Any] {
        ["artifactType": "manifest", "bundleId": bundleId, "url": releases + "/" + bundleId]
    }

    func testTakesTheIdOfAManifestFromTheReleasesUrl() {
        var input = call("b1")
        input["publicKey"] = "attacker"
        input["checksum"] = "attacker"
        XCTAssertEqual(LiveUpdateDownload.bundleId(input, releasesUrl: releases), "b1")
    }

    func testRefusesBundleIdsWithUrlMetacharacters() {
        for id in ["../b1", "%2e%2e", "/b1", "b1/../x", "https://attacker.example/x", "x?y", "x#y", "@evil.com", "a.b", ""] {
            XCTAssertNil(LiveUpdateDownload.bundleId(call(id), releasesUrl: releases), id)
        }
    }

    func testRefusesAnotherUrlTypeOrMissingInput() {
        XCTAssertNil(LiveUpdateDownload.bundleId(["artifactType": "manifest", "bundleId": "b1", "url": "https://attacker.example/b1"], releasesUrl: releases))
        XCTAssertNil(LiveUpdateDownload.bundleId(["artifactType": "manifest", "bundleId": "b1", "url": releases + "/b1/"], releasesUrl: releases))
        XCTAssertNil(LiveUpdateDownload.bundleId(["artifactType": "zip", "bundleId": "b1", "url": releases + "/b1"], releasesUrl: releases))
        XCTAssertNil(LiveUpdateDownload.bundleId(["bundleId": "b1", "url": releases + "/b1"], releasesUrl: releases))
        XCTAssertNil(LiveUpdateDownload.bundleId(["artifactType": "manifest", "bundleId": 1, "url": releases + "/1"], releasesUrl: releases))
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
