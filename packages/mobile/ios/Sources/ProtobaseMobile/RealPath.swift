import Foundation

/** A path with its symlinks, `.` and `..` resolved and each component in its case on disk, or nil when it does not exist. */
func realPath(_ path: String) -> String? {
    guard let resolved = realpath(path, nil) else { return nil }
    defer { free(resolved) }
    return String(cString: resolved)
}
