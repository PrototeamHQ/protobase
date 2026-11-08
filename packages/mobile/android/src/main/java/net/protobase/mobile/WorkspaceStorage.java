package net.protobase.mobile;

/** Where WorkspaceList keeps its values: the app's SharedPreferences, or a map in a test. */
interface WorkspaceStorage {

    /** A write the storage could not persist. */
    final class Failed extends Exception {}

    /** The value, or null when none was written. */
    String read(String key);

    /** Saves the value; Failed when it is not persisted. */
    void write(String key, String value) throws Failed;
}
