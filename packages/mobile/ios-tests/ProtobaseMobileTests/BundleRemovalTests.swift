import XCTest
@testable import ProtobaseMobile

final class BundleRemovalTests: XCTestCase {
    private let app = TestApp()

    // Security case 10: deleting a bundle that holds links deletes the links, not what they point at.
    func testDeletesLinksAndNotTheirTargets() throws {
        let outside = app.root + "/outside"
        app.write(outside + "/keep.txt", bytes("keep"))
        let bundle = app.bundle("b1")
        app.write(bundle + "/index.html", bytes("x"))
        try FileManager.default.createSymbolicLink(atPath: bundle + "/folder", withDestinationPath: outside)
        try FileManager.default.createSymbolicLink(atPath: bundle + "/file", withDestinationPath: outside + "/keep.txt")
        BundleRemoval.delete(root: app.bundles, target: bundle)
        XCTAssertFalse(app.exists(bundle))
        XCTAssertEqual(app.tree(outside), ["keep.txt"])
    }

    func testDeletesABundleThatIsItselfALinkAsTheLink() throws {
        let outside = app.root + "/outside"
        app.write(outside + "/keep.txt", bytes("keep"))
        try FileManager.default.createSymbolicLink(atPath: app.bundle("b1"), withDestinationPath: outside)
        BundleRemoval.delete(root: app.bundles, target: app.bundle("b1"))
        XCTAssertFalse(app.exists(app.bundle("b1")))
        XCTAssertEqual(app.tree(outside), ["keep.txt"])
    }

    func testDeletesOnlyADirectChildOfTheRoot() {
        let outside = app.root + "/outside"
        app.write(outside + "/keep.txt", bytes("keep"))
        BundleRemoval.delete(root: app.bundles, target: app.bundles + "/../../../outside")
        BundleRemoval.delete(root: app.bundles, target: outside)
        XCTAssertEqual(app.tree(outside), ["keep.txt"])
    }
}
