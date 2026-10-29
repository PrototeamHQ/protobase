import XCTest
@testable import ProtobaseMobile

final class BundleCheckTests: XCTestCase {
    private let app = TestApp()
    private lazy var release = TestRelease.make(["index.html": bytes("<p>1</p>"), "assets/app.js": bytes("1")], order: [2000], key: app.key)
    private lazy var dir = app.bundle(release.bundleId)

    override func setUp() {
        for (href, data) in release.served { app.write(dir + "/" + href, data) }
    }

    private func check() -> String? {
        refusal { _ = try BundleCheck.check(dir, bundleId: release.bundleId, key: app.pins.key, binary: app.pins.binary) }
    }

    func testTakesTheFolderOfItsRelease() {
        XCTAssertNil(check())
    }

    func testRefusesAPlantedFile() {
        app.write(dir + "/assets/extra.js", bytes("x"))
        XCTAssertEqual(check(), "its folder holds assets/extra.js, which its manifest does not list")
    }

    func testRefusesAChangedOrMissingFile() {
        app.write(dir + "/assets/app.js", bytes("2"))
        XCTAssertEqual(check(), "its assets/app.js is not the file its manifest names")
        try! FileManager.default.removeItem(atPath: dir + "/assets/app.js")
        XCTAssertEqual(check(), "it lacks assets/app.js")
    }

    // Security case 10: a link beside or in place of a file, to a file or a folder, is refused and not followed.
    func testRefusesALinkWithoutFollowingIt() throws {
        let outside = app.root + "/outside"
        app.write(outside + "/app.js", bytes("1"))
        try FileManager.default.createSymbolicLink(atPath: dir + "/linked", withDestinationPath: outside)
        XCTAssertEqual(check(), "its folder holds a link")
        try FileManager.default.removeItem(atPath: dir + "/linked")
        // In place of a listed file, pointing at a file of the same content.
        try FileManager.default.removeItem(atPath: dir + "/assets/app.js")
        try FileManager.default.createSymbolicLink(atPath: dir + "/assets/app.js", withDestinationPath: outside + "/app.js")
        XCTAssertEqual(check(), "its folder holds a link")
        // The statement itself through a link.
        try FileManager.default.removeItem(atPath: dir + "/assets/app.js")
        app.write(dir + "/assets/app.js", bytes("1"))
        try FileManager.default.moveItem(atPath: dir + "/" + ReleaseStatement.file, toPath: outside + "/statement")
        try FileManager.default.createSymbolicLink(atPath: dir + "/" + ReleaseStatement.file, withDestinationPath: outside + "/statement")
        XCTAssertEqual(check(), "its statement is missing")
    }

    func testRefusesAFolderThatIsALink() throws {
        let link = app.bundles + "/linked"
        try FileManager.default.createSymbolicLink(atPath: link, withDestinationPath: dir)
        XCTAssertEqual(refusal { _ = try BundleCheck.check(link, bundleId: release.bundleId, key: app.pins.key, binary: app.pins.binary) }, "it is no bundle folder")
    }

    func testRefusesAFolderUnderAnotherId() {
        let other = TestRelease.make(["index.html": bytes("2")], order: [3000], key: app.key)
        XCTAssertEqual(refusal { _ = try BundleCheck.check(dir, bundleId: other.bundleId, key: app.pins.key, binary: app.pins.binary) }, "its id does not name its statement and the app's key")
    }
}
