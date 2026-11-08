package net.protobase.mobile;

import android.content.SharedPreferences;

/** WorkspaceList's storage in the app's SharedPreferences, written at once so a list survives the app being killed. */
final class PreferencesStorage implements WorkspaceStorage {

    private final SharedPreferences preferences;

    PreferencesStorage(SharedPreferences preferences) {
        this.preferences = preferences;
    }

    /** The value saved under the key, or null when there is none. */
    @Override
    public String read(String key) {
        return preferences.getString(key, null);
    }

    /** Saves at once, with commit rather than apply, so the value is on disk before the call returns; Failed when not. */
    @Override
    public void write(String key, String value) throws Failed {
        if (!preferences.edit().putString(key, value).commit()) throw new Failed();
    }
}
