import XCTest
@testable import ProtobaseMobile

final class BundlesFolderTests: XCTestCase {
    private var root = ""
    private var outside = ""

    override func setUpWithError() throws {
        let base = NSTemporaryDirectory() + "bundles-" + UUID().uuidString
        root = base + "/bundles"
        outside = base + "/outside"
        try FileManager.default.createDirectory(atPath: root + "/abc", withIntermediateDirectories: true)
        try FileManager.default.createDirectory(atPath: outside, withIntermediateDirectories: true)
        try FileManager.default.createSymbolicLink(atPath: root + "/out", withDestinationPath: outside)
        try FileManager.default.createSymbolicLink(atPath: root + "/twin", withDestinationPath: root + "/abc")
    }

    func testAcceptsAnExistingDirectChild() {
        XCTAssertTrue(BundlesFolder.isBundleId("abc", in: root))
    }

    func testRefusesIdsThatAreNotOneSafeComponent() {
        for id in ["", ".", "..", "../abc", "abc/", "/abc", "a.b", "%2e%2e", "abc\0", "ábc", String(repeating: "a", count: 65)] {
            XCTAssertFalse(BundlesFolder.isBundleId(id, in: root), id)
        }
    }

    func testRefusesSymlinksOutOfTheFolderAndOntoAnotherBundle() {
        XCTAssertFalse(BundlesFolder.isBundleId("out", in: root))
        XCTAssertFalse(BundlesFolder.isBundleId("twin", in: root))
    }

    // The volume ignores case: the id must be the name on disk.
    func testRefusesAnotherCaseOfARealBundle() {
        XCTAssertFalse(BundlesFolder.isBundleId("ABC", in: root))
    }

    func testRefusesAWellFormedIdWithNoBundle() {
        XCTAssertFalse(BundlesFolder.isBundleId("missing", in: root))
    }

    func testShapeTakesSixtyFourSafeCharacters() {
        XCTAssertTrue(BundlesFolder.isBundleIdShape(String(repeating: "a", count: 64)))
        XCTAssertTrue(BundlesFolder.isBundleIdShape("Az09_-"))
    }
}
