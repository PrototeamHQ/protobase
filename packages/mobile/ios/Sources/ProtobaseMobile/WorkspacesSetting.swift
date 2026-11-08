import Foundation

/**
 * Whether `plugins.ProtobaseWorkspaces.enabled` in capacitor.config.json turns workspaces on: only JSON `true` does,
 * absent or `false` leaves them off, and any other value is refused (nil).
 */
enum WorkspacesSetting {
    static func enabled(_ value: Any?) -> Bool? {
        guard let value else { return false }
        guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else { return nil }
        return number.boolValue
    }
}
