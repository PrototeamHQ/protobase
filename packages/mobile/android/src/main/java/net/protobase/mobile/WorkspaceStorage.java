package net.protobase.mobile;

/** Where WorkspaceList keeps its values: the app's SharedPreferences, or a map in a test. */
interface WorkspaceStorage {
    /** The value, or null when none was written. */
    String read(String key);

    void write(String key, String value);
}
