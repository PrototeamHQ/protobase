import XCTest
@testable import ProtobaseMobile

/** An install that a backup restored or that moved to another iPhone purges what it carried before its page loads. */
final class FreshInstallTests: XCTestCase {
    private let keychain = FakeKeychain()
    private let gate = PageGate()
    private var folder: URL!
    private var purges = 0
    private var removing: (() -> Void)?
    private var unlock: (() -> Void)?
    private var locked = false
    private var failures: [Error] = []

    override func setUpWithError() throws {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: folder)
    }

    private var marker: URL { folder.appendingPathComponent("net.protobase.mobile/install") }

    /** Launches; the purge's slow part finishes at once unless `slow`, when `removing` finishes it. */
    private func launch(slow: Bool = false) {
        let install = FreshInstall(
            keychain: keychain,
            markerFile: marker,
            gate: gate,
            whenUnlocked: { [unowned self] run in
                if locked { unlock = run } else { run() }
            },
            purge: { [unowned self] done in
                purges += 1
                if slow { removing = done } else { done() }
            })
        install.prepare { [unowned self] in failures.append($0) }
    }

    func testAFirstLaunchPurgesThenMarksAndOpensThePage() throws {
        launch()
        XCTAssertEqual(purges, 1)
        XCTAssertEqual(try Data(contentsOf: marker), keychain.items[FreshInstall.service])
        XCTAssertFalse(gate.isClosed)
        XCTAssertTrue(failures.isEmpty)
    }

    // Security case 10: the same install relaunched keeps what it has.
    func testARelaunchPurgesNothing() {
        launch()
        launch()
        XCTAssertEqual(purges, 1)
        XCTAssertFalse(gate.isClosed)
    }

    // Consultant's review, finding 2: no page loads before WebKit's data is removed, and no mark is set before then.
    func testThePageWaitsForTheWebViewDataRemoval() {
        launch(slow: true)
        XCTAssertTrue(gate.isClosed)
        XCTAssertNil(keychain.items[FreshInstall.service])
        removing?()
        XCTAssertFalse(gate.isClosed)
        XCTAssertNotNil(keychain.items[FreshInstall.service])
    }

    func testTheMarkerFileIsExcludedFromBackup() throws {
        launch()
        XCTAssertEqual(try marker.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
        XCTAssertFalse(FileManager.default.fileExists(atPath: marker.path + ".new"))
    }

    // Security cases 3, 4 and 9: a restore, even to the same iPhone, has the keychain item but not the file.
    func testARestoreWithoutTheFilePurges() throws {
        launch()
        try FileManager.default.removeItem(at: marker)
        launch()
        XCTAssertEqual(purges, 2)
    }

    // Security cases 3 and 4: another iPhone has no device-only item, even if the file came along.
    func testAnotherDeviceWithoutTheItemPurges() {
        launch()
        keychain.items = [:]
        launch()
        XCTAssertEqual(purges, 2)
    }

    func testMarksThatDifferPurge() throws {
        launch()
        try Data("other".utf8).write(to: marker)
        launch()
        XCTAssertEqual(purges, 2)
    }

    // Consultant's review, finding 1: a launch before the first unlock holds the page and reads, purges and writes nothing.
    func testALockedLaunchWaitsForTheUnlock() {
        locked = true
        launch()
        XCTAssertTrue(gate.isClosed)
        XCTAssertEqual(purges, 0)
        XCTAssertTrue(keychain.items.isEmpty)
        XCTAssertFalse(FileManager.default.fileExists(atPath: marker.path))
        unlock?()
        XCTAssertEqual(purges, 1)
        XCTAssertFalse(gate.isClosed)
    }

    func testAKeychainThatFailsOnceUnlockedFailsWithThePageHeld() {
        keychain.failure = errSecInteractionNotAllowed
        launch()
        XCTAssertEqual((failures.first as? KeychainError)?.status, errSecInteractionNotAllowed)
        XCTAssertEqual(purges, 0)
        XCTAssertTrue(gate.isClosed)
        XCTAssertFalse(FileManager.default.fileExists(atPath: marker.path))
    }
}
