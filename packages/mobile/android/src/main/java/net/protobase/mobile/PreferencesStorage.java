package net.protobase.mobile;

import android.content.SharedPreferences;

/** WorkspaceList's storage in the app's SharedPreferences, written at once so a list survives the app being killed. */
final class PreferencesStorage implements WorkspaceStorage {

    private final SharedPreferences preferences;

    PreferencesStorage(SharedPreferences preferences) {
        this.preferences = preferences;
    }

    @Override
    public String read(String key) {
        return preferences.getString(key, null);
    }

    @Override
    public void write(String key, String value) {
        preferences.edit().putString(key, value).commit();
    }
}
