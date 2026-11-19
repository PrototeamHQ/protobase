import XCTest
@testable import ProtobaseMobile

/** The server's release answer, read as the shell reads it (release-answer.test.ts). */
final class ReleaseAnswerTests: XCTestCase {
    private func parse(_ text: String) -> ReleaseAnswer? {
        ReleaseAnswer.parse(Data(text.utf8))
    }

    func testReadsAReleaseAndNone() {
        XCTAssertEqual(parse(#"{"bundleId":"abc_1-2","url":"https://x/y","required":false}"#), ReleaseAnswer(bundleId: "abc_1-2", required: false))
        XCTAssertEqual(parse(#"{"bundleId":null,"url":null,"required":true,"later":1}"#), ReleaseAnswer(bundleId: nil, required: true))
    }

    func testRefusesAnyOtherBody() {
        XCTAssertNil(parse(#"{"bundleId":"../x","required":false}"#))
        XCTAssertNil(parse(#"{"bundleId":"abc","required":1}"#))
        XCTAssertNil(parse(#"{"bundleId":7,"required":false}"#))
        XCTAssertNil(parse(#"{"required":false}"#))
        XCTAssertNil(parse("[]"))
        XCTAssertNil(parse("not json"))
    }
}
