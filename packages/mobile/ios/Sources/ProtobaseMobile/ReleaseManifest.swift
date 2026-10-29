import Foundation

/**
 * A release's manifest (`releaseManifestFile` in @protobase/schema): every file by `href`, with its sha256 and size.
 * Each href is checked as the very string the guard joins to a folder, before any file of it is read or written.
 */
struct ReleaseManifest {
    static let file = "capawesome-live-update-manifest.json"
    static let maxBytes = 4 * 1024 * 1024
    static let maxFiles = 10_000
    static let maxFileBytes: Int64 = 64 * 1024 * 1024
    static let maxTotalBytes: Int64 = 256 * 1024 * 1024
    private static let maxHref = 1024

    struct Item {
        let href: String
        let checksum: String
        let size: Int64
    }

    let items: [Item]

    /** The manifest `bytes` hold, when they are the ones `statement` names. */
    static func verify(_ bytes: Data, statement: ReleaseStatement) throws -> ReleaseManifest {
        if Sha256.of(bytes) != statement.manifest { throw BundleRefused("its manifest is not the one its statement names") }
        return try parse(bytes)
    }

    /** The manifest `bytes` hold, each href a path inside the folder that holds it. */
    static func parse(_ bytes: Data) throws -> ReleaseManifest {
        if bytes.count > maxBytes { throw BundleRefused("its manifest is too large") }
        guard let entries = Json.parse(bytes) as? [Any] else { throw BundleRefused("its manifest is malformed") }
        if entries.count > maxFiles { throw BundleRefused("its manifest lists too many files") }
        var items: [Item] = []
        var names: Set<String> = [folded(file), folded(ReleaseStatement.file)]
        var total: Int64 = 0
        for entry in entries {
            let item = try self.item(entry)
            // The volume may ignore case and Unicode normalization, where two such hrefs are one file.
            if !names.insert(folded(item.href)).inserted { throw BundleRefused("its manifest lists \(item.href) twice, or a name of the updater's") }
            total += item.size
            if total > maxTotalBytes { throw BundleRefused("its files are too large") }
            items.append(item)
        }
        return ReleaseManifest(items: items)
    }

    /** `name` as a volume that ignores case and Unicode normalization sees it. */
    static func folded(_ name: String) -> String {
        name.precomposedStringWithCanonicalMapping.folding(options: [.caseInsensitive], locale: nil)
    }

    private static func item(_ entry: Any) throws -> Item {
        guard let entry = entry as? [String: Any], entry.count == 3, let href = entry["href"] as? String, let checksum = entry["checksum"] as? String else {
            throw BundleRefused("its manifest has an entry that is not an href, checksum and size")
        }
        if !isRelativePath(href) { throw BundleRefused("its manifest names a file outside its folder") }
        if !Hex.isHex(checksum, count: 64) { throw BundleRefused("its manifest names no checksum for \(href)") }
        guard let size = Json.integer(entry["sizeInBytes"]), size >= 0, size <= maxFileBytes else { throw BundleRefused("its manifest names no size for \(href)") }
        return Item(href: href, checksum: checksum, size: size)
    }

    // Path components joined by `/`: none empty, `.` or `..`, and no `\` or NUL, so neither an absolute path nor one
    // that climbs, nor one another platform reads otherwise. Read as bytes, the way the file system reads it: as
    // characters, a `/` followed by a combining mark is no `/`.
    static func isRelativePath(_ href: String) -> Bool {
        let bytes = Array(href.utf8)
        if bytes.isEmpty || bytes.count > maxHref || bytes.contains(0) || bytes.contains(UInt8(ascii: "\\")) { return false }
        let dot = UInt8(ascii: ".")
        return bytes.split(separator: UInt8(ascii: "/"), omittingEmptySubsequences: false).allSatisfy { !$0.isEmpty && Array($0) != [dot] && Array($0) != [dot, dot] }
    }
}
