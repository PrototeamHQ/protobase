package net.protobase.mobile;

import androidx.webkit.ProfileStore;
import org.json.JSONException;

/**
 * Deletes the WebView profiles of removed workspaces, whose ids WorkspaceList keeps until then. Android refuses to
 * delete a profile this run of the app has loaded, which every opened workspace's is; that profile stays listed and is
 * deleted on a later call after the app started again, before any workspace opens. Main thread only.
 */
final class WorkspaceStores {

    private WorkspaceStores() {}

    /** Deletes each removed workspace's profile Android lets go of and drops its id from the list; a loaded one stays listed. */
    static void removePending(WorkspaceList list) throws JSONException, WorkspaceStorage.Failed {
        ProfileStore profiles = ProfileStore.getInstance();
        for (String id : list.removedStores()) {
            try {
                profiles.deleteProfile(id);
            } catch (IllegalStateException loaded) {
                continue;
            }
            list.storeRemoved(id);
        }
    }
}
