import XCTest
@testable import ProtobaseMobile

final class ReleaseStatementTests: XCTestCase {
    private let key = TestKey.rsa()
    private let binary = ReleaseBinary(appId: TestRelease.appId, fingerprint: TestRelease.fingerprint, shellVersion: TestRelease.shellVersion)
    private lazy var pinned = ReleaseKey.parse(key.pem)!

    private func verify(_ release: TestRelease) -> String? {
        refusal { try binary.accept(ReleaseStatement.verify(release.statement, bundleId: release.bundleId, key: pinned)) }
    }

    private func release(order: [Int64] = [2000], appId: String = TestRelease.appId, fingerprint: String = TestRelease.fingerprint, shellVersion: String = TestRelease.shellVersion) -> TestRelease {
        TestRelease.make(["index.html": bytes("a")], order: order, key: key, appId: appId, fingerprint: fingerprint, shellVersion: shellVersion)
    }

    func testTakesWhatTheServersComposeReleaseSigned() throws {
        let key = ReleaseKey.parse(ServerReleaseFixture.publicKey)!
        let statement = try ReleaseStatement.verify(ServerReleaseFixture.file(ReleaseStatement.file), bundleId: ServerReleaseFixture.bundleId, key: key)
        XCTAssertEqual(statement.order, ServerReleaseFixture.order)
        XCTAssertEqual(statement.manifest, Sha256.of(ServerReleaseFixture.file(ReleaseManifest.file)))
        let binary = ReleaseBinary(appId: ServerReleaseFixture.appId, fingerprint: ServerReleaseFixture.fingerprint, shellVersion: ServerReleaseFixture.shellVersion)
        XCTAssertNoThrow(try binary.accept(statement))
    }

    func testTakesAReleaseOfThisBinary() {
        XCTAssertNil(verify(release()))
    }

    // Security case 1: the id names the pinned key, the signature is another key's.
    func testRefusesAStatementSignedWithAnotherKey() {
        let forged = TestRelease.make(["index.html": bytes("a")], order: [2000], key: key, signer: TestKey.rsa())
        XCTAssertEqual(verify(forged), "its statement is not signed with the app's key")
        let other = TestKey.rsa()
        let foreign = TestRelease.make(["index.html": bytes("a")], order: [2000], key: other)
        XCTAssertEqual(verify(foreign), "its id does not name its statement and the app's key")
    }

    func testRefusesAStatementUnderAnotherId() {
        let a = release()
        let b = release(order: [3000])
        XCTAssertEqual(refusal { _ = try ReleaseStatement.verify(a.statement, bundleId: b.bundleId, key: pinned) }, "its id does not name its statement and the app's key")
    }

    func testRefusesAPayloadChangedAfterSigning() {
        let changed = TestRelease.make(["index.html": bytes("a")], order: [2000], key: key, payload: { signed in
            Data(String(decoding: signed, as: UTF8.self).replacingOccurrences(of: "2000", with: "9000").utf8)
        })
        // Signed over the original payload, carrying the changed one.
        XCTAssertEqual(verify(changed), "its statement is not signed with the app's key")
    }

    func testRefusesAPayloadThatSaysMoreOrLessOrOtherTypes() {
        let manifest = Sha256.of(bytes("[]"))
        let base: [String: Any] = ["manifest": manifest, "order": [2000], "appId": TestRelease.appId, "fingerprint": TestRelease.fingerprint, "shellVersion": TestRelease.shellVersion]
        var cases: [(String, [String: Any])] = []
        var extra = base
        extra["channel"] = "beta"
        cases.append(("its statement does not say exactly what binds it", extra))
        var missing = base
        missing["order"] = nil
        cases.append(("its statement does not say exactly what binds it", missing))
        for order: Any in [[true], [1.5], [-1], [], Array(repeating: 1, count: 9), "2000"] {
            var bad = base
            bad["order"] = order
            cases.append(("its statement names no order", bad))
        }
        var badManifest = base
        badManifest["manifest"] = manifest.uppercased()
        cases.append(("its statement names no manifest hash", badManifest))
        var badVersion = base
        badVersion["shellVersion"] = "1.0"
        cases.append(("its statement names no shell version", badVersion))
        for (reason, fields) in cases {
            let payload = try! JSONSerialization.data(withJSONObject: fields)
            let statement = TestRelease.statementOf(payload, key: key)
            XCTAssertEqual(refusal { _ = try ReleaseStatement.verify(statement, bundleId: TestRelease.idOf(statement, key), key: pinned) }, reason, "\(fields)")
        }
    }

    // Security case 3.
    func testRefusesAReleaseOfAnotherApp() {
        XCTAssertEqual(verify(release(appId: "net.protobase.other")), "it is a release of another app")
    }

    // Security case 5.
    func testRefusesAReleaseForAnotherBinary() {
        XCTAssertEqual(verify(release(fingerprint: "fedcba9876543210")), "it is a release for another binary")
    }

    // Security case 4.
    func testTakesOnlyAServerWhoseApiTheShellWorksWith() {
        XCTAssertEqual(verify(release(shellVersion: "0.58.0")), "it is a release for another shell version")
        XCTAssertEqual(verify(release(shellVersion: "1.57.1")), "it is a release for another shell version")
        XCTAssertNil(verify(release(shellVersion: "0.57.9")))
        let one = ReleaseBinary(appId: TestRelease.appId, fingerprint: TestRelease.fingerprint, shellVersion: "1.2.0")
        for (version, accepted) in [("1.3.0", true), ("1.0.0", true), ("2.2.0", false), ("0.2.0", false)] {
            let statement = try! ReleaseStatement.verify(release(shellVersion: version).statement, bundleId: release(shellVersion: version).bundleId, key: pinned)
            XCTAssertEqual(refusal { try one.accept(statement) } == nil, accepted, version)
        }
    }

    func testRefusesAStatementThatIsTooLarge() {
        let statement = Data(count: ReleaseStatement.maxBytes + 1)
        XCTAssertEqual(refusal { _ = try ReleaseStatement.verify(statement, bundleId: "x", key: pinned) }, "its statement is too large")
    }
}
