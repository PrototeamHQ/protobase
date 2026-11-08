package net.protobase.mobile;

/**
 * Whether `plugins.ProtobaseWorkspaces.enabled` in capacitor.config.json turns workspaces on: only JSON `true` does,
 * absent or `false` leaves them off, and any other value is refused (null).
 */
final class WorkspacesSetting {

    private WorkspacesSetting() {}

    static Boolean enabled(Object value) {
        if (value == null) return false;
        if (value instanceof Boolean) return (Boolean) value;
        return null;
    }
}
