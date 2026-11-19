import XCTest
@testable import ProtobaseMobile

/** The swap rules, as the shell's (swap-decision.test.ts). */
final class SwapDecisionTests: XCTestCase {
    private let release = ReleaseAnswer(bundleId: "b", required: false)

    func testTakesAReleaseTheAppDoesNotRun() {
        XCTAssertEqual(SwapDecision.take(release, current: "a", next: nil), "b")
        XCTAssertEqual(SwapDecision.take(release, current: nil, next: "a"), "b")
    }

    func testChangesNothingOtherwise() {
        XCTAssertNil(SwapDecision.take(nil, current: nil, next: nil))
        XCTAssertNil(SwapDecision.take(ReleaseAnswer(bundleId: nil, required: false), current: "a", next: nil))
        XCTAssertNil(SwapDecision.take(ReleaseAnswer(bundleId: "b", required: true), current: nil, next: nil))
        XCTAssertNil(SwapDecision.take(release, current: "b", next: nil))
        XCTAssertNil(SwapDecision.take(release, current: nil, next: "b"))
    }
}
