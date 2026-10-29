import XCTest
@testable import ProtobaseMobile

final class ReleaseOrderTests: XCTestCase {
    func testComparesElementByElementAMissingOneAsZero() {
        XCTAssertEqual(ReleaseOrder.compare([1, 0], [1]), 0)
        XCTAssertEqual(ReleaseOrder.compare([1, 1], [1]), 1)
        XCTAssertEqual(ReleaseOrder.compare([1], [2, 0]), -1)
    }

    func testDownloadsOnlyAboveTheBuiltInFilesAndNotBelowTheHighest() {
        XCTAssertNoThrow(try ReleaseOrder.acceptDownload([5], builtIn: [4], highest: [5]))
        XCTAssertThrowsError(try ReleaseOrder.acceptDownload([4], builtIn: [4], highest: ReleaseOrder.none))
        XCTAssertThrowsError(try ReleaseOrder.acceptDownload([5], builtIn: [4], highest: [6]))
    }

    func testTakesANextBundleOnlyAboveTheRunningOneAndTheBuiltInFiles() {
        XCTAssertNoThrow(try ReleaseOrder.acceptNext([6], current: [5], builtIn: [4], highest: [6]))
        XCTAssertThrowsError(try ReleaseOrder.acceptNext([5], current: [5], builtIn: [4], highest: [5]))
        XCTAssertThrowsError(try ReleaseOrder.acceptNext([6], current: [5], builtIn: [4], highest: [7]))
        XCTAssertThrowsError(try ReleaseOrder.acceptNext([4], current: [1], builtIn: [4], highest: [4]))
    }

    func testReadsOnlyAnOrdersText() {
        XCTAssertEqual(ReleaseOrder.parse("1800000000000,0"), [1_800_000_000_000, 0])
        for text in ["", "a", "1,", ",1", "-1", "1 ,2", "99999999999999999999", "1,2,3,4,5,6,7,8,9"] {
            XCTAssertNil(ReleaseOrder.parse(text), text)
        }
        XCTAssertNil(ReleaseOrder.parseBuiltIn("0"))
        XCTAssertNil(ReleaseOrder.parseBuiltIn(nil))
        XCTAssertEqual(ReleaseOrder.parseBuiltIn("0,1"), [0, 1])
    }
}
