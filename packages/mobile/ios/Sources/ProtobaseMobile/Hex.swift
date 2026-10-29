import Foundation

/** Lowercase hex, as the server writes hashes and the statement; anything else is refused. */
enum Hex {
    private static let digits = Array("0123456789abcdef".utf8)

    static func encode<Bytes: Sequence>(_ bytes: Bytes) -> String where Bytes.Element == UInt8 {
        var text: [UInt8] = []
        for byte in bytes {
            text.append(digits[Int(byte >> 4)])
            text.append(digits[Int(byte & 0xf)])
        }
        return String(decoding: text, as: UTF8.self)
    }

    static func decode(_ text: String, _ what: String) throws -> Data {
        let chars = Array(text.utf8)
        guard chars.count % 2 == 0 else { throw BundleRefused("\(what) is no hex") }
        var bytes = Data(capacity: chars.count / 2)
        for i in stride(from: 0, to: chars.count, by: 2) {
            guard let high = digit(chars[i]), let low = digit(chars[i + 1]) else { throw BundleRefused("\(what) is no hex") }
            bytes.append(high << 4 | low)
        }
        return bytes
    }

    static func isHex(_ text: String, count: Int) -> Bool {
        let chars = Array(text.utf8)
        return chars.count == count && chars.allSatisfy { digit($0) != nil }
    }

    private static func digit(_ c: UInt8) -> UInt8? {
        switch c {
        case UInt8(ascii: "0")...UInt8(ascii: "9"): return c - UInt8(ascii: "0")
        case UInt8(ascii: "a")...UInt8(ascii: "f"): return c - UInt8(ascii: "a") + 10
        default: return nil
        }
    }
}
