import XCTest
@testable import ProtobaseMobile

/** Downloads through the guard, as the plugin does: into the downloads folder, then moved into the bundles folder. */
final class ReleaseDownloadTests: XCTestCase {
    private let app = TestApp()
    private lazy var guarded = app.makeGuard()
    private let v1 = ["index.html": bytes("<p>1</p>"), "assets/app.js": bytes("one"), "assets/lib.js": bytes("lib")]

    private func download(_ id: String) -> String? {
        refusal { try guarded.download(id) }
    }

    // Nothing was left outside the bundles folder, and nothing of a refused download is in it.
    private func assertNothingLeft(_ id: String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(app.tree(app.downloads), [], file: file, line: line)
        XCTAssertFalse(app.exists(app.bundle(id)), file: file, line: line)
    }

    func testDownloadsARelease() throws {
        let release = app.release(v1, order: [2000])
        XCTAssertNil(download(release.bundleId))
        XCTAssertEqual(app.tree(app.bundle(release.bundleId)), ["assets", "assets/app.js", "assets/lib.js", ReleaseManifest.file, "index.html", ReleaseStatement.file].sorted())
        XCTAssertEqual(try Data(contentsOf: URL(fileURLWithPath: app.bundle(release.bundleId) + "/assets/app.js")), bytes("one"))
        XCTAssertEqual(app.tree(app.downloads), [])
    }

    func testCopiesTheFilesTheBinaryHasOnTheFirstUpdate() {
        app.buildIn(["index.html": bytes("<p>0</p>"), "assets/lib.js": bytes("lib")])
        let release = app.release(v1, order: [2000])
        XCTAssertNil(download(release.bundleId))
        XCTAssertEqual(app.source.hrefs(release.bundleId).sorted(), [ReleaseStatement.file, ReleaseManifest.file, "assets/app.js", "index.html"].sorted())
    }

    func testDownloadsOnlyTheFilesThatChangedFromTheRunningBundle() {
        let first = app.release(v1, order: [2000])
        XCTAssertNil(download(first.bundleId))
        app.currentPath = app.bundle(first.bundleId)
        var v2 = v1
        v2["assets/app.js"] = bytes("two")
        // Moved, same content: copied by its checksum.
        v2["assets/moved.js"] = v2.removeValue(forKey: "assets/lib.js")
        let second = app.release(v2, order: [3000])
        XCTAssertNil(download(second.bundleId))
        XCTAssertEqual(app.source.hrefs(second.bundleId), [ReleaseStatement.file, ReleaseManifest.file, "assets/app.js"])
    }

    // Security case 12: a running bundle's file under the new href but with other bytes is not reused by its name.
    func testReusesAFileOnlyByItsContent() {
        let first = app.release(["index.html": bytes("<p>1</p>"), "assets/app.js": bytes("old")], order: [2000])
        XCTAssertNil(download(first.bundleId))
        app.currentPath = app.bundle(first.bundleId)
        let second = app.release(["index.html": bytes("<p>1</p>"), "assets/app.js": bytes("new")], order: [3000])
        XCTAssertNil(download(second.bundleId))
        XCTAssertEqual(app.source.hrefs(second.bundleId), [ReleaseStatement.file, ReleaseManifest.file, "assets/app.js"])
        XCTAssertEqual(try Data(contentsOf: URL(fileURLWithPath: app.bundle(second.bundleId) + "/assets/app.js")), bytes("new"))
    }

    // Security case 12: a copy whose bytes are not the manifest's after the copy is dropped, and the signed file fetched.
    func testFetchesAFileWhoseCopyIsNotTheOneTheManifestNames() throws {
        app.buildIn(["index.html": bytes("<p>0</p>"), "assets/lib.js": bytes("lib")])
        // The binary's manifest still names lib.js by its checksum, but its bytes changed since.
        app.write(app.builtInFiles + "/assets/lib.js", bytes("LIB"))
        let release = app.release(v1, order: [2000])
        XCTAssertNil(download(release.bundleId))
        XCTAssertTrue(app.source.hrefs(release.bundleId).contains("assets/lib.js"))
        XCTAssertEqual(try Data(contentsOf: URL(fileURLWithPath: app.bundle(release.bundleId) + "/assets/lib.js")), bytes("lib"))
    }

    // Security case 1.
    func testRefusesAReleaseSignedWithAnotherKey() {
        let forged = TestRelease.make(v1, order: [2000], key: app.key, signer: TestKey.rsa())
        app.source.serve(forged)
        XCTAssertEqual(download(forged.bundleId), "its statement is not signed with the app's key")
        XCTAssertEqual(app.source.hrefs(forged.bundleId), [ReleaseStatement.file])
        assertNothingLeft(forged.bundleId)
    }

    // A downgrade: an older release's statement and files, served under a new id, name the old id.
    func testRefusesAnOlderReleaseUnderANewId() {
        let old = app.release(v1, order: [2000])
        let new = app.release(["index.html": bytes("<p>2</p>")], order: [3000])
        XCTAssertNil(download(new.bundleId))
        app.source.releases[new.bundleId] = old.served
        try? FileManager.default.removeItem(atPath: app.bundle(new.bundleId))
        XCTAssertEqual(download(new.bundleId), "its id does not name its statement and the app's key")
        XCTAssertEqual(download(old.bundleId), "it is older than a release the app downloaded")
        assertNothingLeft(old.bundleId)
    }

    // Swap: two signed files of the release answered under each other's href.
    func testRefusesFilesSwappedBetweenHrefs() {
        let release = app.release(v1, order: [2000])
        app.source.releases[release.bundleId]?["assets/app.js"] = bytes("lib")
        app.source.releases[release.bundleId]?["assets/lib.js"] = bytes("one")
        XCTAssertNotNil(download(release.bundleId))
        assertNothingLeft(release.bundleId)
    }

    // Replay: the same href's answer from an earlier release signed with the same key.
    func testRefusesAnEarlierReleasesAnswerForTheSameHref() {
        let earlier = app.release(v1, order: [2000])
        var v2 = v1
        v2["assets/app.js"] = bytes("two")
        let later = app.release(v2, order: [3000])
        app.source.releases[later.bundleId]?["assets/app.js"] = earlier.served["assets/app.js"]
        XCTAssertEqual(download(later.bundleId), "its assets/app.js is not the file its manifest names")
        assertNothingLeft(later.bundleId)
    }

    // Security case 11: a file served larger than its manifest says is refused and not kept.
    func testRefusesAFileLargerThanItsManifestSays() {
        let release = app.release(v1, order: [2000])
        app.source.releases[release.bundleId]?["assets/app.js"] = bytes("one and more")
        XCTAssertEqual(download(release.bundleId), "its assets/app.js is larger than 3 bytes")
        assertNothingLeft(release.bundleId)
    }

    // A manifest whose href climbs out is refused before any file is fetched or written.
    func testRefusesAClimbingHrefBeforeAnyFileIsWritten() {
        for href in ["../../../escaped.js", "/tmp/escaped.js", "a\\..\\b.js", "a\0.js", "x.js"] {
            let manifest = TestRelease.manifestOf(entries: [
                ["href": "x.js", "checksum": Sha256.of(bytes("x")), "sizeInBytes": 1],
                ["href": href, "checksum": Sha256.of(bytes("x")), "sizeInBytes": 1],
            ])
            var files = ["x.js": bytes("x")]
            files[href] = bytes("x")
            let release = TestRelease.make(files, order: [2000], key: app.key, manifest: manifest)
            app.source.serve(release)
            XCTAssertNotNil(download(release.bundleId), href)
            XCTAssertEqual(app.source.hrefs(release.bundleId), [ReleaseStatement.file, ReleaseManifest.file], href)
            assertNothingLeft(release.bundleId)
        }
        XCTAssertEqual(app.tree(app.root).filter { $0.hasSuffix("escaped.js") }, [])
    }

    func testRefusesAReleaseNotAboveTheBuiltInFiles() {
        let release = app.release(v1, order: [1000])
        XCTAssertEqual(download(release.bundleId), "it is not newer than the app's built-in files")
        assertNothingLeft(release.bundleId)
    }

    // Security cases 3 to 5 at download.
    func testRefusesAReleaseForAnotherAppBinaryOrShell() {
        for (release, reason) in [
            (TestRelease.make(v1, order: [2000], key: app.key, appId: "net.protobase.other"), "it is a release of another app"),
            (TestRelease.make(v1, order: [2000], key: app.key, fingerprint: "fedcba9876543210"), "it is a release for another binary"),
            (TestRelease.make(v1, order: [2000], key: app.key, shellVersion: "0.58.0"), "it is a release for another shell version"),
        ] {
            app.source.serve(release)
            XCTAssertEqual(download(release.bundleId), reason)
            assertNothingLeft(release.bundleId)
        }
    }

    // Security case 6 at download.
    func testRefusesAManifestEditedAfterSigning() {
        let release = app.release(v1, order: [2000])
        var entries = (try! JSONSerialization.jsonObject(with: release.manifest) as! [[String: Any]])
        entries.append(["href": "evil.js", "checksum": Sha256.of(bytes("evil")), "sizeInBytes": 4])
        app.source.releases[release.bundleId]?[ReleaseManifest.file] = TestRelease.manifestOf(entries: entries)
        app.source.releases[release.bundleId]?["evil.js"] = bytes("evil")
        XCTAssertEqual(download(release.bundleId), "its manifest is not the one its statement names")
        assertNothingLeft(release.bundleId)
    }

    func testClearsWhatAnUnfinishedDownloadLeft() {
        app.write(app.downloads + "/leftover/index.html", bytes("x"))
        guarded.clearDownloads()
        XCTAssertFalse(app.exists(app.downloads))
    }
}
