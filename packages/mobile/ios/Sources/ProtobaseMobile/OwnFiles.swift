import Foundation

/**
 * The files of the bundle the app runs, by checksum, which a download copies instead of fetching: a downloaded
 * bundle's folder, or the binary's own files, as the manifest beside them lists them. A copy is hashed again as it
 * is written, so it is bound by its content to the release's manifest, never by where it came from.
 */
struct OwnFiles {
    /** None: every file is fetched. */
    static let none = OwnFiles(files: [:])

    private let files: [String: String]

    /** The files of `dir` its own manifest lists, regular files only; none when it has no manifest that parses. */
    static func inFolder(_ dir: String) -> OwnFiles {
        guard let bytes = try? LocalFile.read(dir + "/" + ReleaseManifest.file, limit: ReleaseManifest.maxBytes, "its manifest"),
              let manifest = try? ReleaseManifest.parse(bytes) else { return none }
        var files: [String: String] = [:]
        for item in manifest.items where LocalFile.kind(dir + "/" + item.href) == .file {
            files[item.checksum] = dir + "/" + item.href
        }
        return OwnFiles(files: files)
    }

    /** The path of a file of checksum `checksum`, or nil when the bundle has none. */
    func path(_ checksum: String) -> String? {
        files[checksum]
    }
}
