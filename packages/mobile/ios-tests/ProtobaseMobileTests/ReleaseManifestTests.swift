import XCTest
@testable import ProtobaseMobile

final class ReleaseManifestTests: XCTestCase {
    private func entry(_ href: String, _ content: String = "a") -> [String: Any] {
        ["href": href, "checksum": Sha256.of(bytes(content)), "sizeInBytes": content.utf8.count]
    }

    private func parse(_ entries: [[String: Any]]) -> String? {
        refusal { _ = try ReleaseManifest.parse(TestRelease.manifestOf(entries: entries)) }
    }

    func testListsEachFile() throws {
        let manifest = try ReleaseManifest.parse(TestRelease.manifestOf(entries: [entry("index.html"), entry("assets/a b.js", "bb")]))
        XCTAssertEqual(manifest.items.map(\.href), ["index.html", "assets/a b.js"])
        XCTAssertEqual(manifest.items.map(\.size), [1, 2])
    }

    // Security case 6.
    func testRefusesAManifestOtherThanTheStatementNames() throws {
        let key = TestKey.rsa()
        let release = TestRelease.make(["index.html": bytes("a")], order: [2000], key: key)
        let statement = try ReleaseStatement.verify(release.statement, bundleId: release.bundleId, key: ReleaseKey.parse(key.pem)!)
        XCTAssertNoThrow(try ReleaseManifest.verify(release.manifest, statement: statement))
        let added = TestRelease.manifestOf(entries: [entry("index.html"), entry("evil.js")])
        let changed = TestRelease.manifestOf(entries: [entry("index.html", "evil")])
        for manifest in [added, changed] {
            XCTAssertEqual(refusal { _ = try ReleaseManifest.verify(manifest, statement: statement) }, "its manifest is not the one its statement names")
        }
    }

    // Security cases 8 and 9, and the climbing href.
    func testRefusesAnHrefThatIsNoPathInsideTheFolder() {
        let combiningSlash = "a/\u{301}../../x"
        for href in ["/etc/passwd", "../x", "a/../../x", "a/./b", "a//b", "a/", "", "a\\b", "..\\x", "a\0b", ".", "..", combiningSlash, String(repeating: "a", count: 1025)] {
            XCTAssertNotNil(parse([entry(href)]), href)
        }
    }

    func testRefusesTheUpdatersOwnNamesAndDuplicatesAsTheVolumeSeesThem() {
        for href in [ReleaseManifest.file, ReleaseStatement.file, "PROTOBASE-RELEASE.json"] {
            XCTAssertNotNil(parse([entry(href)]), href)
        }
        XCTAssertNotNil(parse([entry("a.js"), entry("a.js")]))
        XCTAssertNotNil(parse([entry("a.js"), entry("A.js")]))
        // é precomposed and decomposed.
        XCTAssertNotNil(parse([entry("caf\u{e9}.js"), entry("cafe\u{301}.js")]))
    }

    func testRefusesAnEntryOfAnotherShape() {
        var extra = entry("a.js")
        extra["signature"] = "x"
        var noSize = entry("a.js")
        noSize["sizeInBytes"] = nil
        var floatSize = entry("a.js")
        floatSize["sizeInBytes"] = 1.5
        var hugeSize = entry("a.js")
        hugeSize["sizeInBytes"] = ReleaseManifest.maxFileBytes + 1
        var badChecksum = entry("a.js")
        badChecksum["checksum"] = "abc"
        for bad in [extra, noSize, floatSize, hugeSize, badChecksum] {
            XCTAssertNotNil(parse([bad]), "\(bad)")
        }
        XCTAssertEqual(refusal { _ = try ReleaseManifest.parse(bytes("{}")) }, "its manifest is malformed")
    }

    func testCapsTheFilesTheyListAndTheirTotal() {
        var big = entry("a.js")
        big["sizeInBytes"] = ReleaseManifest.maxFileBytes
        let many = (0..<5).map { i -> [String: Any] in
            var e = big
            e["href"] = "f\(i)"
            return e
        }
        XCTAssertEqual(parse(many), "its files are too large")
        XCTAssertEqual(parse((0...ReleaseManifest.maxFiles).map { entry("f\($0)") }), "its manifest lists too many files")
    }
}
