import XCTest
@testable import ProtobaseMobile

final class ReleaseKeyTests: XCTestCase {
    func testTakesAnRsaSpkiAsPemOrBareBase64() {
        let key = TestKey.rsa()
        XCTAssertNotNil(ReleaseKey.parse(key.pem))
        let bare = key.pem.replacingOccurrences(of: "-----BEGIN PUBLIC KEY-----", with: "").replacingOccurrences(of: "-----END PUBLIC KEY-----", with: "")
        XCTAssertEqual(ReleaseKey.parse(bare)?.spki, ReleaseKey.parse(key.pem)?.spki)
        XCTAssertNotNil(ReleaseKey.parse(ServerReleaseFixture.publicKey))
    }

    func testRefusesAKeyOfAnotherTypeOrShape() {
        let spki = [UInt8](TestKey.rsa().spki)
        // The PKCS#1 key inside the SPKI, without its algorithm.
        let pkcs1 = Array(spki.suffix(from: 24))
        for text in [nil, "", " ", "garbage", TestKey.ecPem(), TestDer.pem(pkcs1), TestDer.pem(spki + [0]), TestDer.pem(Array(spki.dropLast()))] {
            XCTAssertNil(ReleaseKey.parse(text), text ?? "nil")
        }
    }
}
