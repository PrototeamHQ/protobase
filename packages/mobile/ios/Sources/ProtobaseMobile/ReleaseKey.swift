import Foundation
import Security

/**
 * The key releases are signed with, `plugins.LiveUpdate.publicKey`: an RSA public key as base64 SPKI DER, with or
 * without PEM's lines, as the CLI writes it. The SPKI is read here, so a key of another type is refused rather than
 * left to Security; its DER is kept, since a release's id hashes it.
 */
struct ReleaseKey {
    let key: SecKey
    let spki: Data

    // rsaEncryption, 1.2.840.113549.1.1.1.
    private static let rsaOid: [UInt8] = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]

    /** The key `text` holds, or nil when it is no RSA SPKI. */
    static func parse(_ text: String?) -> ReleaseKey? {
        guard let text else { return nil }
        let body = text.replacingOccurrences(of: "-----BEGIN PUBLIC KEY-----", with: "")
            .replacingOccurrences(of: "-----END PUBLIC KEY-----", with: "")
            .filter { !$0.isWhitespace }
        guard !body.isEmpty, let spki = Data(base64Encoded: body), let pkcs1 = rsaPublicKey(inSpki: [UInt8](spki)) else { return nil }
        let attributes: [CFString: Any] = [kSecAttrKeyType: kSecAttrKeyTypeRSA, kSecAttrKeyClass: kSecAttrKeyClassPublic]
        guard let key = SecKeyCreateWithData(Data(pkcs1) as CFData, attributes as CFDictionary, nil) else { return nil }
        return ReleaseKey(key: key, spki: spki)
    }

    /** Whether `key` signed `message`, RSA PKCS#1 v1.5 with SHA-256, as the server's `sign('sha256', …)`. */
    func signed(_ message: Data, _ signature: Data) -> Bool {
        SecKeyVerifySignature(key, .rsaSignatureMessagePKCS1v15SHA256, message as CFData, signature as CFData, nil)
    }

    // SEQUENCE { SEQUENCE { OID rsaEncryption, NULL }, BIT STRING { 0 unused bits, RSAPublicKey } }, nothing after it.
    private static func rsaPublicKey(inSpki der: [UInt8]) -> [UInt8]? {
        var outer = Der(der)
        guard var spki = outer.read(0x30), outer.atEnd else { return nil }
        guard var algorithm = spki.read(0x30), let oid = algorithm.read(0x06), oid.rest == rsaOid else { return nil }
        if !algorithm.atEnd { guard let null = algorithm.read(0x05), null.atEnd, algorithm.atEnd else { return nil } }
        guard let bits = spki.read(0x03), spki.atEnd, bits.rest.first == 0 else { return nil }
        let key = Array(bits.rest.dropFirst())
        var check = Der(key)
        guard check.read(0x30) != nil, check.atEnd else { return nil }
        return key
    }
}

/** A DER reader over definite lengths only, which is all DER allows. */
private struct Der {
    private let bytes: [UInt8]
    private var at = 0

    init(_ bytes: [UInt8]) {
        self.bytes = bytes
    }

    var atEnd: Bool { at == bytes.count }
    var rest: [UInt8] { Array(bytes[at...]) }

    /** The contents of the next element when its tag is `tag`, moving past it. */
    mutating func read(_ tag: UInt8) -> Der? {
        guard at + 2 <= bytes.count, bytes[at] == tag else { return nil }
        var i = at + 1
        var length = Int(bytes[i])
        i += 1
        if length & 0x80 != 0 {
            let count = length & 0x7f
            guard count >= 1, count <= 4, i + count <= bytes.count else { return nil }
            length = 0
            for _ in 0..<count {
                length = length << 8 | Int(bytes[i])
                i += 1
            }
        }
        guard length <= bytes.count - i else { return nil }
        let contents = Der(Array(bytes[i..<(i + length)]))
        at = i + length
        return contents
    }
}
