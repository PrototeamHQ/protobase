import Foundation

/**
 * Which downloaded release a host serves and which it serves after its next swap, by bundle id, in the host's own user
 * defaults; none for the binary's own files. A value that is no bundle id reads as none.
 */
struct HostedReleaseState {
    private static let currentKey = "ProtobaseHostedReleases.current"
    private static let nextKey = "ProtobaseHostedReleases.next"

    let defaults: UserDefaults

    var current: String? {
        get { read(Self.currentKey) }
        nonmutating set { defaults.set(newValue, forKey: Self.currentKey) }
    }

    var next: String? {
        get { read(Self.nextKey) }
        nonmutating set { defaults.set(newValue, forKey: Self.nextKey) }
    }

    private func read(_ key: String) -> String? {
        guard let id = defaults.string(forKey: key), BundlesFolder.isBundleIdShape(id) else { return nil }
        return id
    }
}
