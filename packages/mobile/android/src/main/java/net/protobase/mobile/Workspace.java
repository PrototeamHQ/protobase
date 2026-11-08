package net.protobase.mobile;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * A workspace the shell lists: `id`, a UUID minted when it is added, which also names its WebView profile; its origin
 * (WorkspaceOrigin); and the name and icon URL the home view gave it, if any (null).
 */
final class Workspace {

    final String id;
    final String origin;
    final String name;
    final String icon;

    Workspace(String id, String origin, String name, String icon) {
        this.id = id;
        this.origin = origin;
        this.name = name;
        this.icon = icon;
    }

    JSONObject toJson() throws JSONException {
        JSONObject json = new JSONObject().put("id", id).put("origin", origin);
        if (name != null) json.put("name", name);
        if (icon != null) json.put("icon", icon);
        return json;
    }

    static Workspace fromJson(JSONObject json) throws JSONException {
        return new Workspace(json.getString("id"), json.getString("origin"), json.has("name") ? json.getString("name") : null, json.has("icon") ? json.getString("icon") : null);
    }
}
