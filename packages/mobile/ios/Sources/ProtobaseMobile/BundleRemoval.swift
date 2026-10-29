import Foundation

/** Deletes a folder the guard owns, never following a link out of it: a link is deleted itself. */
enum BundleRemoval {
    /** Deletes `target` when it is a direct child of `root`. */
    static func delete(root: String, target: String) {
        let parent = URL(fileURLWithPath: target).standardized.deletingLastPathComponent().path
        guard parent == URL(fileURLWithPath: root).standardized.path else { return }
        deleteTree(target)
    }

    private static func deleteTree(_ path: String) {
        switch LocalFile.kind(path) {
        case .missing:
            return
        case .folder:
            for name in (try? FileManager.default.contentsOfDirectory(atPath: path)) ?? [] { deleteTree(path + "/" + name) }
            rmdir(path)
        case .file, .link, .other:
            unlink(path)
        }
    }
}
