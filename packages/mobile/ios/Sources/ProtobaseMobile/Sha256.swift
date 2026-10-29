import CryptoKit
import Foundation

/** sha256 as lowercase hex, of bytes or of a file read in chunks. */
enum Sha256 {
    static func of(_ parts: Data...) -> String {
        var hasher = SHA256()
        for part in parts { hasher.update(data: part) }
        return Hex.encode(hasher.finalize())
    }

    /** The sha256 of the regular file `path`, never read through a link. */
    static func of(file path: String) throws -> String {
        var hasher = Sha256Hasher()
        try LocalFile.stream(path, (path as NSString).lastPathComponent) { hasher.update($0) }
        return hasher.finish()
    }
}

/** sha256 over chunks. */
struct Sha256Hasher {
    private var hasher = SHA256()

    mutating func update(_ data: Data) {
        hasher.update(data: data)
    }

    func finish() -> String {
        Hex.encode(hasher.finalize())
    }
}
