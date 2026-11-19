import XCTest
@testable import ProtobaseMobile

/** Answers a check as the server would, with the release it names. */
private final class FakeAsking: ReleaseAsking {
    var answer_: ReleaseAnswer?
    func answer() -> ReleaseAnswer? { answer_ }
}

/** The host target: a check sets a release next, a swap serves it, and a start keeps only what passes its check. */
final class HostedReleasesTests: XCTestCase {
    private let app = TestApp()
    private let asking = FakeAsking()
    private var root: String { app.root + "/hosted" }

    override func setUp() {
        app.buildIn(["index.html": bytes("<p>own</p>")])
    }

    private func hosted() -> HostedReleases {
        HostedReleases(pins: app.pins, asking: asking, source: app.source, builtInFiles: URL(fileURLWithPath: app.builtInFiles), storage: .init(root: root, defaults: app.defaults))
    }

    private func offer(_ order: Int64, required: Bool = false) -> TestRelease {
        let release = app.release(["index.html": bytes("<p>\(order)</p>")], order: [order])
        asking.answer_ = ReleaseAnswer(bundleId: release.bundleId, required: required)
        return release
    }

    private func check(_ releases: HostedReleases) -> HostedCheck {
        let done = expectation(description: "check")
        var outcome: HostedCheck?
        releases.check {
            outcome = $0
            done.fulfill()
        }
        wait(for: [done], timeout: 10)
        return outcome!
    }

    private func index(_ folder: URL) -> String {
        String(decoding: try! Data(contentsOf: folder.appendingPathComponent("index.html")), as: UTF8.self)
    }

    func testServesTheBuiltInFilesUntilASwap() {
        let releases = hosted()
        let release = offer(2000)
        XCTAssertEqual(check(releases), .ready(URL(fileURLWithPath: root + "/bundles/" + release.bundleId, isDirectory: true)))
        XCTAssertEqual(index(releases.currentFiles), "<p>own</p>")
        XCTAssertTrue(releases.swap())
        XCTAssertEqual(index(releases.currentFiles), "<p>2000</p>")
        XCTAssertNil(releases.nextFiles)
        XCTAssertFalse(releases.swap())
    }

    func testAChecklessAnswerChangesNothing() {
        let releases = hosted()
        asking.answer_ = nil
        XCTAssertEqual(check(releases), .unchanged)
        _ = offer(2000, required: true)
        XCTAssertEqual(check(releases), .unchanged)
        XCTAssertNil(releases.nextFiles)
    }

    func testANewerReleaseReplacesTheOneSetNextAndTheSwapDeletesTheOld() {
        let releases = hosted()
        let first = offer(2000)
        _ = check(releases)
        XCTAssertTrue(releases.swap())
        let second = offer(3000)
        let third = offer(4000)
        asking.answer_ = ReleaseAnswer(bundleId: second.bundleId, required: false)
        _ = check(releases)
        asking.answer_ = ReleaseAnswer(bundleId: third.bundleId, required: false)
        _ = check(releases)
        XCTAssertFalse(app.exists(root + "/bundles/" + second.bundleId))
        XCTAssertTrue(releases.swap())
        XCTAssertEqual(index(releases.currentFiles), "<p>4000</p>")
        XCTAssertEqual(app.tree(root + "/bundles").filter { !$0.contains("/") }, [third.bundleId])
        XCTAssertFalse(app.exists(root + "/bundles/" + first.bundleId))
    }

    func testRefusesAnOlderReleaseThanTheOneServed() {
        let releases = hosted()
        _ = offer(3000)
        _ = check(releases)
        releases.swap()
        _ = offer(2000)
        XCTAssertEqual(check(releases), .refused("it is older than a release the app downloaded"))
        XCTAssertEqual(index(releases.currentFiles), "<p>3000</p>")
    }

    func testRefusesAReleaseOfAnotherKey() {
        let releases = hosted()
        let other = TestRelease.make(["index.html": bytes("<p>x</p>")], order: [2000], key: TestKey.rsa())
        app.source.serve(other)
        asking.answer_ = ReleaseAnswer(bundleId: other.bundleId, required: false)
        guard case .refused = check(releases) else { return XCTFail("a release of another key was taken") }
        XCTAssertNil(releases.nextFiles)
    }

    func testARestartKeepsTheSwappedReleaseWhileItPassesItsCheck() {
        let release = offer(2000)
        let first = hosted()
        _ = check(first)
        first.swap()
        XCTAssertEqual(index(hosted().currentFiles), "<p>2000</p>")
        app.write(root + "/bundles/" + release.bundleId + "/planted.js", bytes("evil"))
        let restarted = hosted()
        XCTAssertEqual(index(restarted.currentFiles), "<p>own</p>")
        XCTAssertFalse(app.exists(root + "/bundles/" + release.bundleId))
    }

    func testARestartDropsAReleaseNotAboveTheBuiltInFilesOfAnUpdatedApp() {
        _ = offer(2000)
        let first = hosted()
        _ = check(first)
        first.swap()
        app.builtInOrder = "5000"
        XCTAssertEqual(index(hosted().currentFiles), "<p>own</p>")
    }

    func testMakeRefusesAName() {
        let settings = HostedReleaseSettings(apiOrigin: "https://api.example.com", publicKey: app.key.pem, fingerprint: TestRelease.fingerprint, shellVersion: TestRelease.shellVersion, builtInOrder: "1000")
        guard case .failure = HostedReleases.make(settings, builtInFiles: URL(fileURLWithPath: app.builtInFiles), name: "../x", appId: TestRelease.appId) else { return XCTFail("a name with a separator was taken") }
        guard case .success = HostedReleases.make(settings, builtInFiles: URL(fileURLWithPath: app.builtInFiles), name: "test-" + UUID().uuidString, appId: TestRelease.appId) else { return XCTFail("the settings were refused") }
    }

    func testTheQueryNamesTheBinary() {
        let query = ReleaseQuery(apiOrigin: "https://api.example.com", binary: app.pins.binary)
        XCTAssertEqual(query?.url.absoluteString, "https://api.example.com/api/mobile/release?fingerprint=\(TestRelease.fingerprint)&shell_version=\(TestRelease.shellVersion)")
    }
}
