import XCTest
@testable import ProtobaseMobile

final class LocalFileGuardTests: XCTestCase {
    // A fresh install has no bundles folder until its first download, which the app loads in the same run.
    func testServesABundleWhoseFolderAppearedAfterLaunch() throws {
        try? FileManager.default.removeItem(atPath: BundlesFolder.path)
        let bundle = BundlesFolder.path + "/b1"
        let fileGuard = LocalFileGuard(basePath: bundle)
        XCTAssertTrue(fileGuard.withLock { fileGuard.refuses(path: "/index.html") })
        try FileManager.default.createDirectory(atPath: bundle, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(atPath: BundlesFolder.path) }
        try Data("<html></html>".utf8).write(to: URL(fileURLWithPath: bundle + "/index.html"))
        XCTAssertFalse(fileGuard.withLock { fileGuard.refuses(path: "/index.html") })
    }

    func testRefusesAFileLinkedOutOfTheBundlesFolder() throws {
        let outside = NSTemporaryDirectory() + "outside-" + UUID().uuidString
        try FileManager.default.createDirectory(atPath: outside, withIntermediateDirectories: true)
        try Data("secret".utf8).write(to: URL(fileURLWithPath: outside + "/secret.txt"))
        let bundle = BundlesFolder.path + "/b2"
        try FileManager.default.createDirectory(atPath: bundle, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(atPath: BundlesFolder.path) }
        try FileManager.default.createSymbolicLink(atPath: bundle + "/secret.txt", withDestinationPath: outside + "/secret.txt")
        let fileGuard = LocalFileGuard(basePath: bundle)
        XCTAssertTrue(fileGuard.withLock { fileGuard.refuses(path: "/secret.txt") })
    }
}
