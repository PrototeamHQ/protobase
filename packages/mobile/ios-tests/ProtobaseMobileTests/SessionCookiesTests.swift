import XCTest
@testable import ProtobaseMobile

/** The cookies ProtobaseAuth keeps: what an answer sets and removes, and where a request sends them. */
final class SessionCookiesTests: XCTestCase {
    private let api = URL(string: "https://api.example.com/api/auth/sign-in/email")!
    // Max-Age counts from the clock, so the tests do too.
    private let now = Date()

    // Security case: the time a sign-out's answer is read at, which is after its Max-Age=0 cookie was parsed.
    func testMaxAgeZeroRemovesTheCookieAtTheTimeOfReading() {
        let kept = SessionCookies.none.received(answer("a=1; Path=/"), for: api)
        XCTAssertTrue(kept.received(answer("a=; Path=/; Max-Age=0"), for: api).isEmpty)
    }

    private func answer(_ setCookie: String, url: URL? = nil) -> HTTPURLResponse {
        HTTPURLResponse(url: url ?? api, statusCode: 200, httpVersion: nil, headerFields: ["Set-Cookie": setCookie])!
    }

    func testKeepsEachCookieOfAnAnswer() {
        let cookies = SessionCookies.none.received(answer("a=1; Path=/; Secure; HttpOnly, b=2; Path=/; Max-Age=3600"), for: api, now: now)
        XCTAssertEqual(cookies.header(for: api, now: now), "a=1; b=2")
    }

    func testANewValueReplacesTheOld() {
        let first = SessionCookies.none.received(answer("a=1; Path=/"), for: api, now: now)
        XCTAssertEqual(first.received(answer("a=2; Path=/"), for: api, now: now).header(for: api, now: now), "a=2")
    }

    // Security case: signing out leaves no cookie.
    func testMaxAgeZeroAndAPastExpiryRemoveTheCookie() {
        let kept = SessionCookies.none.received(answer("a=1; Path=/, b=2; Path=/"), for: api, now: now)
        let cleared = kept.received(answer("a=; Path=/; Max-Age=0, b=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"), for: api)
        XCTAssertTrue(cleared.isEmpty)
        XCTAssertNil(cleared.header(for: api, now: now))
    }

    func testAnExpiredCookieIsNotSent() {
        let kept = SessionCookies.none.received(answer("a=1; Path=/; Max-Age=60"), for: api, now: now)
        XCTAssertNil(kept.header(for: api, now: now.addingTimeInterval(3600)))
    }

    func testSendsNothingToAnotherHost() {
        let kept = SessionCookies.none.received(answer("a=1; Path=/"), for: api, now: now)
        XCTAssertNil(kept.header(for: URL(string: "https://other.example.com/api/auth/token")!, now: now))
        XCTAssertNil(kept.header(for: URL(string: "https://evil-api.example.com/api/auth/token")!, now: now))
    }

    func testSendsASecureCookieOverHttpsOnly() {
        let kept = SessionCookies.none.received(answer("a=1; Path=/; Secure"), for: api, now: now)
        XCTAssertNil(kept.header(for: URL(string: "http://api.example.com/api/auth/token")!, now: now))
    }

    func testMatchesThePathOnASegmentBoundary() {
        let kept = SessionCookies.none.received(answer("a=1; Path=/api/auth"), for: api, now: now)
        XCTAssertEqual(kept.header(for: URL(string: "https://api.example.com/api/auth/token")!, now: now), "a=1")
        XCTAssertNil(kept.header(for: URL(string: "https://api.example.com/api/authx")!, now: now))
    }

    func testEncodesAndDecodesWhole() throws {
        let kept = SessionCookies.none.received(answer("a=1; Path=/; Max-Age=3600; Secure"), for: api, now: now)
        XCTAssertEqual(try JSONDecoder().decode(SessionCookies.self, from: JSONEncoder().encode(kept)), kept)
    }
}
