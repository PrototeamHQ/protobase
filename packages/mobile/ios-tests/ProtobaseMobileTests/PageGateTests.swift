import XCTest
@testable import ProtobaseMobile

/** The gate the app's own files wait at while a fresh install's purge runs. */
final class PageGateTests: XCTestCase {
    private let gate = PageGate()
    private let a = NSObject()
    private let b = NSObject()

    func testRunsAtOnceWhenOpen() {
        var ran = false
        gate.whenOpen(ObjectIdentifier(a)) { ran = true }
        XCTAssertTrue(ran)
    }

    func testHoldsUntilOpenThenRunsInOrder() {
        var ran: [String] = []
        gate.close()
        gate.whenOpen(ObjectIdentifier(a)) { ran.append("a") }
        gate.whenOpen(ObjectIdentifier(b)) { ran.append("b") }
        XCTAssertEqual(ran, [])
        gate.open()
        XCTAssertEqual(ran, ["a", "b"])
    }

    func testACancelledRequestNeverRuns() {
        var ran: [String] = []
        gate.close()
        gate.whenOpen(ObjectIdentifier(a)) { ran.append("a") }
        gate.whenOpen(ObjectIdentifier(b)) { ran.append("b") }
        XCTAssertTrue(gate.cancel(ObjectIdentifier(a)))
        XCTAssertFalse(gate.cancel(ObjectIdentifier(a)))
        gate.open()
        XCTAssertEqual(ran, ["b"])
    }
}
