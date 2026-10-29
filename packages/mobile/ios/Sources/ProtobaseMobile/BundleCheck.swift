import Foundation

/**
 * Checks a bundle folder on disk before the app runs it: its statement names its id and is signed with the app's key
 * for this binary, its manifest is the one the statement names, every file it lists is there with its checksum and
 * size, and the folder holds nothing else, no link either. Nothing is followed through a link.
 */
enum BundleCheck {
    static func check(_ dir: String, bundleId: String, key: ReleaseKey, binary: ReleaseBinary) throws -> ReleaseStatement {
        if LocalFile.kind(dir) != .folder { throw BundleRefused("it is no bundle folder") }
        let statement = try ReleaseStatement.verify(LocalFile.read(dir + "/" + ReleaseStatement.file, limit: ReleaseStatement.maxBytes, "its statement"), bundleId: bundleId, key: key)
        try binary.accept(statement)
        let manifest = try ReleaseManifest.verify(LocalFile.read(dir + "/" + ReleaseManifest.file, limit: ReleaseManifest.maxBytes, "its manifest"), statement: statement)
        var expected: Set<String> = [ReleaseStatement.file, ReleaseManifest.file]
        for item in manifest.items { expected.insert(item.href) }
        var budget = expected.count * 2
        try walk(dir, prefix: "", expected: expected, budget: &budget)
        for item in manifest.items {
            let path = dir + "/" + item.href
            if LocalFile.kind(path) != .file { throw BundleRefused("it lacks \(item.href)") }
            if try Sha256.of(file: path) != item.checksum || fileSize(path) != item.size { throw BundleRefused("its \(item.href) is not the file its manifest names") }
        }
        return statement
    }

    // Every entry below `dir`, as `prefix` + its name: a file must be expected by its exact name, a folder is walked, a
    // link or anything else refuses the bundle. `budget` bounds the entries, so a planted tree cannot keep the check busy.
    private static func walk(_ dir: String, prefix: String, expected: Set<String>, budget: inout Int) throws {
        guard let names = try? FileManager.default.contentsOfDirectory(atPath: dir) else { throw BundleRefused("it could not be read") }
        for name in names {
            budget -= 1
            if budget < 0 { throw BundleRefused("its folder holds files its manifest does not list") }
            let path = prefix + name
            switch LocalFile.kind(dir + "/" + name) {
            case .folder: try walk(dir + "/" + name, prefix: path + "/", expected: expected, budget: &budget)
            case .file: if !expected.contains(path) { throw BundleRefused("its folder holds \(path), which its manifest does not list") }
            case .link: throw BundleRefused("its folder holds a link")
            case .other, .missing: throw BundleRefused("its folder holds \(path), which is no file")
            }
        }
    }

    private static func fileSize(_ path: String) -> Int64 {
        var info = stat()
        return lstat(path, &info) == 0 ? Int64(info.st_size) : -1
    }
}
