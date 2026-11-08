import XCTest
@testable import ProtobaseMobile

final class WorkspaceListTests: XCTestCase {
    private var defaults: UserDefaults!
    private var list: WorkspaceList!

    override func setUp() {
        defaults = UserDefaults(suiteName: "WorkspaceListTests")!
        defaults.removePersistentDomain(forName: "WorkspaceListTests")
        list = WorkspaceList(defaults)
    }

    func testKeepsWorkspacesInTheOrderAdded() throws {
        let acme = try list.add(origin: URL(string: "https://acme.example.com")!, name: "Acme", icon: "https://acme.example.com/icon.png")
        let beta = try list.add(origin: URL(string: "https://beta.example.com")!, name: nil, icon: nil)
        XCTAssertNotNil(UUID(uuidString: acme.id))
        XCTAssertNotEqual(acme.id, beta.id)
        XCTAssertEqual(try WorkspaceList(defaults).all(), [acme, beta])
        XCTAssertEqual(try list.find(beta.id), beta)
    }

    func testRefusesAnOriginListedAlready() throws {
        _ = try list.add(origin: URL(string: "https://acme.example.com")!, name: nil, icon: nil)
        XCTAssertThrowsError(try list.add(origin: URL(string: "https://acme.example.com")!, name: "Again", icon: nil)) {
            XCTAssertEqual($0 as? WorkspaceList.Failure, .listed)
        }
    }

    func testRemovingKeepsTheStoreUntilItIsDeleted() throws {
        let acme = try list.add(origin: URL(string: "https://acme.example.com")!, name: nil, icon: nil)
        try list.remove(acme.id)
        XCTAssertEqual(try list.all(), [])
        XCTAssertEqual(list.removedStores(), [acme.id])
        list.storeRemoved(acme.id)
        XCTAssertEqual(list.removedStores(), [])
        XCTAssertThrowsError(try list.remove(acme.id)) { XCTAssertEqual($0 as? WorkspaceList.Failure, .unknown) }
    }
}
