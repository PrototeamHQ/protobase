import XCTest
@testable import ProtobaseMobile

final class BlockedBundlesTests: XCTestCase {
    func testBlocksTheListedIds() {
        XCTAssertFalse(BlockedBundles.blocks(nil, "a1"))
        XCTAssertFalse(BlockedBundles.blocks("", "a1"))
        XCTAssertTrue(BlockedBundles.blocks("b2,a1", "a1"))
        XCTAssertFalse(BlockedBundles.blocks("b2,c3", "a1"))
    }

    // Security case 2: a list the guard cannot read blocks every id.
    func testBlocksEveryIdWhileItCannotReadTheList() {
        for value: Any in ["b2,,c3", "b2;a1", "a1 ", 42, ["a1"], Data()] {
            XCTAssertTrue(BlockedBundles.blocks(value, "a1"), "\(value)")
        }
    }
}
