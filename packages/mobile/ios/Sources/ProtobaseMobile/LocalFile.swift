import Foundation

/** Files the guard reads and writes in folders it owns, never through a link: each is checked with lstat and opened with O_NOFOLLOW. */
enum LocalFile {
    enum Kind {
        case file, folder, link, other, missing
    }

    static func kind(_ path: String) -> Kind {
        var info = stat()
        if lstat(path, &info) != 0 { return .missing }
        switch info.st_mode & S_IFMT {
        case S_IFREG: return .file
        case S_IFDIR: return .folder
        case S_IFLNK: return .link
        default: return .other
        }
    }

    // What was opened, not what the path names by now.
    private static func isFile(_ fd: Int32) -> Bool {
        var info = stat()
        return fstat(fd, &info) == 0 && info.st_mode & S_IFMT == S_IFREG
    }

    /** The bytes of the regular file `path`, at most `limit`. */
    static func read(_ path: String, limit: Int, _ what: String) throws -> Data {
        let fd = open(path, O_RDONLY | O_NOFOLLOW)
        if fd < 0 { throw BundleRefused("\(what) is missing") }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        guard isFile(fd) else { throw BundleRefused("\(what) is no file") }
        let data = handle.readData(ofLength: limit + 1)
        if data.count > limit { throw BundleRefused("\(what) is larger than \(limit) bytes") }
        return data
    }

    /** Hands the regular file `path` to `body` in chunks. */
    static func stream(_ path: String, _ what: String, _ body: (Data) throws -> Void) throws {
        let fd = open(path, O_RDONLY | O_NOFOLLOW)
        if fd < 0 { throw BundleRefused("\(what) could not be read") }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        guard isFile(fd) else { throw BundleRefused("\(what) is no file") }
        while true {
            let chunk = handle.readData(ofLength: 64 * 1024)
            if chunk.isEmpty { return }
            try body(chunk)
        }
    }

    /** Writes `data` to the new file `path`. */
    static func create(_ path: String, _ data: Data) throws {
        let sink = try FileSink(path, limit: Int64(data.count))
        try sink.write(data)
        _ = try sink.finish()
    }
}

/**
 * A new file the guard writes, hashed as it is written and holding at most `limit` bytes: created exclusively and
 * without following a link, so it never writes through one or over a file already there.
 */
final class FileSink {
    private let handle: FileHandle
    private let limit: Int64
    private var hasher = Sha256Hasher()
    private(set) var size: Int64 = 0

    init(_ path: String, limit: Int64) throws {
        let fd = open(path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
        if fd < 0 { throw BundleRefused("\((path as NSString).lastPathComponent) could not be created") }
        handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        self.limit = limit
    }

    func write(_ data: Data) throws {
        size += Int64(data.count)
        if size > limit { throw BundleRefused("a file is larger than its manifest says") }
        hasher.update(data)
        try handle.write(contentsOf: data)
    }

    /** The sha256 of what was written. */
    func finish() throws -> String {
        try handle.close()
        return hasher.finish()
    }
}
