import XCTest
@testable import ProtobaseMobile

final class WorkspacesSettingTests: XCTestCase {
    private func parsed(_ json: String) -> Any? {
        let object = try! JSONSerialization.jsonObject(with: Data("{\"enabled\":\(json)}".utf8)) as! [String: Any]
        return object["enabled"]
    }

    func testOnlyJsonTrueTurnsWorkspacesOn() {
        XCTAssertEqual(WorkspacesSetting.enabled(parsed("true")), true)
        XCTAssertEqual(WorkspacesSetting.enabled(parsed("false")), false)
        XCTAssertEqual(WorkspacesSetting.enabled(nil), false)
    }

    func testRefusesAnyOtherValue() {
        for json in ["1", "0", "\"true\"", "\"on\"", "null", "{}"] {
            XCTAssertNil(WorkspacesSetting.enabled(parsed(json)), json)
        }
    }
}
