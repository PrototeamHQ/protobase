package net.protobase.mobile;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;

/**
 * The workspaces the shell lists, in native storage, beyond page script: one per origin, in the order they were added.
 * A removed workspace's id waits in `removedStores` until its profile is deleted.
 */
final class WorkspaceList {

    static final class Listed extends Exception {}

    static final class Unknown extends Exception {}

    private static final String LIST_KEY = "list";
    private static final String REMOVED_KEY = "removed";

    private final WorkspaceStorage storage;

    WorkspaceList(WorkspaceStorage storage) {
        this.storage = storage;
    }

    /** Every listed workspace, in the order added. */
    List<Workspace> all() throws JSONException {
        JSONArray array = new JSONArray(orEmpty(storage.read(LIST_KEY)));
        List<Workspace> workspaces = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) workspaces.add(Workspace.fromJson(array.getJSONObject(i)));
        return workspaces;
    }

    /** The workspace with `id`; Unknown when none has it. */
    Workspace find(String id) throws JSONException, Unknown {
        for (Workspace workspace : all()) {
            if (workspace.id.equals(id)) return workspace;
        }
        throw new Unknown();
    }

    /** Lists a workspace under a new id; Listed when one already has the origin. */
    Workspace add(String origin, String name, String icon) throws JSONException, Listed, WorkspaceStorage.Failed {
        List<Workspace> workspaces = all();
        for (Workspace workspace : workspaces) {
            if (workspace.origin.equals(origin)) throw new Listed();
        }
        Workspace added = new Workspace(UUID.randomUUID().toString(), origin, name, icon);
        workspaces.add(added);
        save(workspaces);
        return added;
    }

    /** Drops the workspace and keeps its id in `removedStores`; Unknown when none has it. */
    void remove(String id) throws JSONException, Unknown, WorkspaceStorage.Failed {
        List<Workspace> workspaces = all();
        if (!workspaces.removeIf(workspace -> workspace.id.equals(id))) throw new Unknown();
        List<String> removed = removedStores();
        removed.add(id);
        storage.write(REMOVED_KEY, new JSONArray(removed).toString());
        save(workspaces);
    }

    /** The ids of removed workspaces whose profiles are not deleted yet. */
    List<String> removedStores() throws JSONException {
        JSONArray array = new JSONArray(orEmpty(storage.read(REMOVED_KEY)));
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) ids.add(array.getString(i));
        return ids;
    }

    /** Forgets a removed workspace's id once its profile is deleted. */
    void storeRemoved(String id) throws JSONException, WorkspaceStorage.Failed {
        List<String> removed = removedStores();
        removed.remove(id);
        storage.write(REMOVED_KEY, new JSONArray(removed).toString());
    }

    /** Writes the whole list. */
    private void save(List<Workspace> workspaces) throws JSONException, WorkspaceStorage.Failed {
        JSONArray array = new JSONArray();
        for (Workspace workspace : workspaces) array.put(workspace.toJson());
        storage.write(LIST_KEY, array.toString());
    }

    /** The stored JSON, or an empty array when nothing was written. */
    private static String orEmpty(String json) {
        return json == null ? "[]" : json;
    }
}
