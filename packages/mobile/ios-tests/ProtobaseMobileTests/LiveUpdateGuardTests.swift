import XCTest
@testable import ProtobaseMobile

/** The choice of the next bundle, and what a rollback and a restart leave of it. */
final class LiveUpdateGuardTests: XCTestCase {
    private let app = TestApp()
    private lazy var guarded = app.makeGuard()
    private var chosen: [String] = []

    private func release(_ order: Int64, _ text: String = "x") -> TestRelease {
        app.release(["index.html": bytes("<p>\(order)\(text)</p>")], order: [order])
    }

    private func downloaded(_ order: Int64) -> String {
        let release = release(order)
        XCTAssertNil(refusal { try guarded.download(release.bundleId) })
        return release.bundleId
    }

    private func setNext(_ id: String, on guarded: LiveUpdateGuard? = nil) -> String? {
        refusal { try (guarded ?? self.guarded).setNext(id) { chosen.append(id) } }
    }

    private func block(_ ids: Any) {
        app.defaults.set(ids, forKey: BlockedBundles.key)
    }

    func testSetsADownloadedBundleAboveTheRunningOne() {
        let id = downloaded(2000)
        XCTAssertNil(setNext(id))
        XCTAssertEqual(chosen, [id])
    }

    // Download A, then B, then setNextBundle(A).
    func testRefusesABundleBelowTheHighestDownloaded() {
        let a = downloaded(2000)
        let b = downloaded(3000)
        XCTAssertEqual(setNext(a), "it is older than a release the app downloaded")
        XCTAssertNil(setNext(b))
        XCTAssertEqual(chosen, [b])
    }

    // Security case 14.
    func testRefusesABundleOfTheRunningOnesOrder() {
        let id = downloaded(2000)
        app.currentPath = app.bundle(id)
        XCTAssertEqual(setNext(id), "it is not newer than the bundle the app runs")
        XCTAssertTrue(app.exists(app.bundle(id)), "the running bundle is not deleted")
    }

    // Security case 15: the highest order downloaded survives a restart.
    func testRefusesADowngradeAcrossARestart() {
        let b = downloaded(3000)
        XCTAssertNil(setNext(b))
        let restarted = app.makeGuard()
        let a = release(2000)
        XCTAssertEqual(refusal { try restarted.download(a.bundleId) }, "it is older than a release the app downloaded")
        // Planted on disk as if downloaded before the mark.
        for (href, data) in a.served { app.write(app.bundle(a.bundleId) + "/" + href, data) }
        XCTAssertEqual(setNext(a.bundleId, on: restarted), "it is older than a release the app downloaded")
        XCTAssertFalse(app.exists(app.bundle(a.bundleId)))
    }

    // On a fresh install, a release below builtInOrder is refused at the switch as at the download.
    func testRefusesABundleNotAboveTheBuiltInFiles() {
        app.builtInOrder = "5000"
        let fresh = app.makeGuard()
        let old = release(2000)
        for (href, data) in old.served { app.write(app.bundle(old.bundleId) + "/" + href, data) }
        XCTAssertEqual(setNext(old.bundleId, on: fresh), "it is not newer than the bundle the app runs")
        XCTAssertEqual(refusal { try fresh.download(self.release(3000).bundleId) }, "it is not newer than the app's built-in files")
    }

    // A planted file refuses the bundle, which is deleted, and the next bundle stays as it was.
    func testRefusesAndDeletesABundleWithAPlantedFile() {
        let a = downloaded(2000)
        XCTAssertNil(setNext(a))
        app.nextPath = app.bundle(a)
        let b = downloaded(3000)
        app.write(app.bundle(b) + "/planted.js", bytes("evil"))
        XCTAssertEqual(setNext(b), "its folder holds planted.js, which its manifest does not list")
        XCTAssertFalse(app.exists(app.bundle(b)))
        XCTAssertEqual(chosen, [a])
        XCTAssertTrue(app.exists(app.bundle(a)))
    }

    func testKeepsARefusedBundleThatIsNext() {
        let a = downloaded(2000)
        app.nextPath = app.bundle(a)
        app.write(app.bundle(a) + "/planted.js", bytes("evil"))
        XCTAssertNotNil(setNext(a))
        XCTAssertTrue(app.exists(app.bundle(a)))
    }

    // Security case 16, and a release that rolled back on its first start is not downloaded again.
    func testRefusesARolledBackBundleAtTheSwitchAndTheDownload() {
        let a = release(2000)
        XCTAssertNil(refusal { try guarded.download(a.bundleId) })
        block(a.bundleId)
        XCTAssertEqual(setNext(a.bundleId), "it was rolled back")
        let requests = app.source.requests.count
        XCTAssertEqual(refusal { try guarded.download(a.bundleId) }, "it was rolled back")
        XCTAssertTrue(guarded.isBlocked(a.bundleId))
        XCTAssertEqual(app.source.requests.count, requests)
        XCTAssertEqual(chosen, [])
    }

    // Security case 2: a list it cannot read refuses an id it does not list, at both.
    func testRefusesEveryBundleWhileItCannotReadTheBlockList() {
        let a = downloaded(2000)
        block(7)
        XCTAssertEqual(setNext(a), "it was rolled back")
        XCTAssertEqual(refusal { try guarded.download(self.release(3000).bundleId) }, "it was rolled back")
    }

    // The running bundle's order is read from its statement, and refused when it cannot be checked.
    func testRefusesWhileTheRunningBundlesStatementCannotBeChecked() throws {
        let a = downloaded(2000)
        let b = downloaded(3000)
        app.currentPath = app.bundle(a)
        app.nextPath = app.bundle(b)
        try FileManager.default.removeItem(atPath: app.bundle(a) + "/" + ReleaseStatement.file)
        XCTAssertEqual(setNext(b), "the running bundle's statement could not be checked: its statement is missing")
        app.write(app.bundle(a) + "/" + ReleaseStatement.file, TestRelease.make(["index.html": bytes("x")], order: [1], key: app.key).statement)
        XCTAssertEqual(setNext(b), "the running bundle's statement could not be checked: its id does not name its statement and the app's key")
        XCTAssertEqual(chosen, [])
    }

    // A mark it cannot read refuses rather than counting as none.
    func testRefusesWhileTheHighestOrderCannotBeRead() {
        let a = downloaded(2000)
        app.nextPath = app.bundle(a)
        for mark: Any in ["x", "1,,2", 5] {
            app.defaults.set(mark, forKey: LiveUpdateMarks.key)
            XCTAssertEqual(setNext(a), "the highest order the app downloaded cannot be read", "\(mark)")
            XCTAssertEqual(refusal { try guarded.download(self.release(3000).bundleId) }, "the highest order the app downloaded cannot be read")
        }
    }

    func testNamesOnlyABundleFoldersPathAsABundle() {
        let id = downloaded(2000)
        XCTAssertEqual(guarded.bundleIdOf(app.bundle(id)), id)
        XCTAssertEqual(guarded.bundleIdOf(app.bundle(id) + "/"), id)
        XCTAssertNil(guarded.bundleIdOf(app.builtInFiles))
        XCTAssertNil(guarded.bundleIdOf(app.root + "/elsewhere/" + id))
        XCTAssertNil(guarded.bundleIdOf(""))
        XCTAssertNil(guarded.bundleIdOf(nil))
    }
}
