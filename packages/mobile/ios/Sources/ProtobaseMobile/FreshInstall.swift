import Foundation
import Security
import UIKit

/**
 * What the app's AppDelegate calls first thing at launch, before the bridge reads what a live update left: an app a
 * backup restored, even on the same iPhone, or one moved to another iPhone, starts as a fresh install, signed out with
 * no drafts and no live update.
 */
public enum ProtobaseFreshInstall {
    public static func prepare() {
        FreshInstall.device().prepare { error in
            fatalError("Protobase cannot tell whether this install is new: \(error)")
        }
    }
}

/**
 * An install knows itself by a random mark kept twice: in a keychain item that stays on this device, and in a file that
 * no backup holds. A restore lacks the file and another iPhone lacks the item too, so either missing, or the two
 * differing, purges everything the app kept, then sets the mark again. The page waits at PageGate until that is done.
 * While the device is locked, as in a launch in the background before the first unlock, both are unreadable: it reads,
 * purges and writes nothing until the device is unlocked.
 */
struct FreshInstall {
    static let service = "net.protobase.mobile.install"

    let keychain: Keychain
    let markerFile: URL
    let gate: PageGate
    /** Runs its closure on the main thread once protected data is available: now, or at the unlock. */
    let whenUnlocked: (@escaping () -> Void) -> Void
    /** Purges, throwing on what it removes at once, and calls its closure once the rest is removed too. */
    let purge: (@escaping () -> Void) throws -> Void

    static func device() -> FreshInstall {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return FreshInstall(
            keychain: DeviceKeychain(),
            markerFile: support.appendingPathComponent("net.protobase.mobile/install"),
            gate: .shared,
            whenUnlocked: whenProtectedDataAvailable,
            purge: DevicePurge.run)
    }

    func prepare(fail: @escaping (Error) -> Void) {
        gate.close()
        whenUnlocked {
            do {
                try check(fail: fail)
            } catch {
                fail(error)
            }
        }
    }

    private func check(fail: @escaping (Error) -> Void) throws {
        if try isKnown() {
            gate.open()
            return
        }
        try purge {
            do {
                try mark()
                gate.open()
            } catch {
                fail(error)
            }
        }
    }

    private func isKnown() throws -> Bool {
        guard let kept = try keychain.read(Self.service), FileManager.default.fileExists(atPath: markerFile.path) else { return false }
        return try Data(contentsOf: markerFile) == kept
    }

    private func mark() throws {
        var bytes = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard status == errSecSuccess else { throw KeychainError(status: status) }
        try keychain.write(Self.service, Data(bytes))
        try writeMarker(Data(bytes))
    }

    /** Writes the file aside, excludes it from backup, then moves it in place, so the file never stands unexcluded. */
    private func writeMarker(_ mark: Data) throws {
        let folder = markerFile.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var aside = folder.appendingPathComponent(markerFile.lastPathComponent + ".new")
        try mark.write(to: aside)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try aside.setResourceValues(values)
        _ = try FileManager.default.replaceItemAt(markerFile, withItemAt: aside)
    }

    private static func whenProtectedDataAvailable(_ run: @escaping () -> Void) {
        if UIApplication.shared.isProtectedDataAvailable {
            run()
            return
        }
        var observer: NSObjectProtocol?
        observer = NotificationCenter.default.addObserver(forName: UIApplication.protectedDataDidBecomeAvailableNotification, object: nil, queue: .main) { _ in
            if let observer { NotificationCenter.default.removeObserver(observer) }
            run()
        }
    }
}
