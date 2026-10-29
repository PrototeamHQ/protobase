import XCTest
@testable import ProtobaseMobile

/** Answers the session's requests as the test sets, and records every URL asked for. */
final class StubProtocol: URLProtocol {
    enum Answer {
        case ok(Data)
        case status(Int)
        case redirect(String)
        /** A body that never ends. */
        case endless
    }

    static var answers: [String: Answer] = [:]
    static var requested: [String] = []
    private var stopped = false

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let url = request.url!
        Self.requested.append(url.absoluteString)
        let respond = { (status: Int, headers: [String: String]) in
            HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        }
        switch Self.answers[url.absoluteString] ?? .status(404) {
        case .ok(let data):
            client?.urlProtocol(self, didReceive: respond(200, [:]), cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        case .status(let status):
            client?.urlProtocol(self, didReceive: respond(status, [:]), cacheStoragePolicy: .notAllowed)
            client?.urlProtocolDidFinishLoading(self)
        case .redirect(let location):
            let response = respond(302, ["Location": location])
            client?.urlProtocol(self, wasRedirectedTo: URLRequest(url: URL(string: location)!), redirectResponse: response)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocolDidFinishLoading(self)
        case .endless:
            client?.urlProtocol(self, didReceive: respond(200, [:]), cacheStoragePolicy: .notAllowed)
            DispatchQueue.global().async {
                // Bounded so a broken guard fails the test rather than hanging it.
                for _ in 0..<10_000 where !self.stopped {
                    self.client?.urlProtocol(self, didLoad: Data(count: 64 * 1024))
                }
            }
        }
    }

    override func stopLoading() {
        stopped = true
    }
}

final class ReleaseFetchTests: XCTestCase {
    private let releases = "https://api.example.com/api/mobile/releases"

    private func fetch(_ href: String, limit: Int64 = 1024) -> (data: Data, refusal: String?) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubProtocol.self]
        let fetch = ReleaseFetch(releasesUrl: releases, configuration: configuration)
        var data = Data()
        var reason: String?
        let done = expectation(description: "fetched")
        DispatchQueue.global().async {
            reason = refusal { try fetch.fetch(bundleId: "b1", href: href, limit: limit) { data.append($0) } }
            done.fulfill()
        }
        wait(for: [done], timeout: 20)
        return (data, reason)
    }

    override func setUp() {
        StubProtocol.answers = [:]
        StubProtocol.requested = []
    }

    func testFetchesTheFileOfTheReleaseByItsHref() {
        StubProtocol.answers[releases + "/b1?href=assets%2Fa%20b%3F%23%26.js"] = .ok(bytes("x"))
        let result = fetch("assets/a b?#&.js")
        XCTAssertNil(result.refusal)
        XCTAssertEqual(result.data, bytes("x"))
    }

    // Security case 7: a redirect is not followed, whatever file it answers for.
    func testDoesNotFollowARedirect() {
        for href in [ReleaseStatement.file, ReleaseManifest.file, "index.html"] {
            let target = "https://attacker.example/" + href
            StubProtocol.answers[releases + "/b1?href=" + href.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-._~")))!] = .redirect(target)
            StubProtocol.answers[target] = .ok(bytes("evil"))
            let result = fetch(href)
            XCTAssertEqual(result.refusal, "the server answered 302 for \(href)")
            XCTAssertTrue(result.data.isEmpty)
            XCTAssertFalse(StubProtocol.requested.contains(target))
        }
    }

    func testRefusesAnyAnswerButA200() {
        StubProtocol.answers[releases + "/b1?href=index.html"] = .status(404)
        XCTAssertEqual(fetch("index.html").refusal, "the server answered 404 for index.html")
    }

    // Security case 11: a body larger than its limit, or one without end, is cut off at the limit.
    func testCutsOffABodyLargerThanItsLimit() {
        StubProtocol.answers[releases + "/b1?href=a.js"] = .ok(Data(count: 1025))
        let large = fetch("a.js", limit: 1024)
        XCTAssertEqual(large.refusal, "its a.js is larger than 1024 bytes")
        XCTAssertTrue(large.data.isEmpty)
        StubProtocol.answers[releases + "/b1?href=b.js"] = .endless
        let endless = fetch("b.js", limit: 1024 * 1024)
        XCTAssertEqual(endless.refusal, "its b.js is larger than 1048576 bytes")
        XCTAssertLessThanOrEqual(endless.data.count, 1024 * 1024)
    }
}
