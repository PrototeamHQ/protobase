package net.protobase.mobile;

import android.app.Activity;
import android.view.ViewGroup;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONException;

/**
 * The home view's hold on the workspace views: `list`, `add` (`origin`, and `name` and `icon` if known), `open` and
 * `remove` by id, and `showHome`, which hides the open one. A workspace page's `openDrawer` reaches the home view as the
 * `openDrawer` event with the workspace's `id`. Off unless `plugins.ProtobaseWorkspaces.enabled` is `true`; refused
 * beside the live updater, which this mode does not use, and on a WebView without profiles, which could not keep the
 * workspaces' data apart. Every app's shell compiles it, so off, every method rejects.
 */
@CapacitorPlugin(name = "ProtobaseWorkspaces")
public class ProtobaseWorkspaces extends Plugin {

    private interface Body {
        void run(WorkspaceViews views, WorkspaceList list) throws JSONException, WorkspaceList.Listed, WorkspaceList.Unknown, WorkspaceStorage.Failed;
    }

    private WorkspaceList list;
    private WorkspaceViews views;

    /** Reads the list from the app's SharedPreferences and wires the views to the bridge's screen, the system browser and the plugin's events. */
    @Override
    public void load() {
        list = new WorkspaceList(new PreferencesStorage(getContext().getSharedPreferences("ProtobaseWorkspaces", Activity.MODE_PRIVATE)));
        views = new WorkspaceViews(
            () -> (ViewGroup) bridge.getWebView().getParent(),
            url -> SystemBrowser.open(getContext(), url),
            (workspace, message) -> notifyListeners(message.name, new JSObject().put("id", workspace.id)));
    }

    /** Answers `{ workspaces }` in the order added, after deleting the profiles of removed workspaces that can go. */
    @PluginMethod
    public void list(PluginCall call) {
        run(call, (views, list) -> {
            WorkspaceStores.removePending(list);
            JSArray workspaces = new JSArray();
            for (Workspace workspace : list.all()) workspaces.put(workspace.toJson());
            call.resolve(new JSObject().put("workspaces", workspaces));
        });
    }

    /** Lists the workspace at `origin` and answers `{ workspace }`; rejects an origin that does not parse or is already listed. */
    @PluginMethod
    public void add(PluginCall call) {
        run(call, (views, list) -> {
            String origin = WorkspaceOrigin.parse(call.getString("origin"));
            if (origin == null) {
                call.reject("A workspace's origin is an https origin, or http on localhost or 127.0.0.1, with no path");
                return;
            }
            Workspace workspace = list.add(origin, call.getString("name"), call.getString("icon"));
            call.resolve(new JSObject().put("workspace", JSObject.fromJSONObject(workspace.toJson())));
        });
    }

    /** Shows the workspace with `id`, making its view the first time; rejects an unknown id or a view that cannot be made. */
    @PluginMethod
    public void open(PluginCall call) {
        run(call, (views, list) -> {
            if (!views.show(list.find(call.getString("id", "")))) {
                call.reject("The workspace view cannot open");
                return;
            }
            call.resolve();
        });
    }

    /** Hides every workspace view, so the home view shows. */
    @PluginMethod
    public void showHome(PluginCall call) {
        run(call, (views, list) -> {
            views.showHome();
            call.resolve();
        });
    }

    /** Closes the workspace's view, drops it from the list and deletes its profile when Android lets it. */
    @PluginMethod
    public void remove(PluginCall call) {
        run(call, (views, list) -> {
            String id = call.getString("id", "");
            views.close(id);
            list.remove(id);
            WorkspaceStores.removePending(list);
            call.resolve();
        });
    }

    /** Runs a method's body on the main thread once the mode is on, answering a known failure with its own rejection. */
    private void run(PluginCall call, Body body) {
        String refusal = refusal();
        if (refusal != null) {
            call.reject(refusal);
            return;
        }
        bridge.executeOnMainThread(() -> {
            try {
                body.run(views, list);
            } catch (WorkspaceList.Listed listed) {
                call.reject("That workspace is already listed");
            } catch (WorkspaceList.Unknown unknown) {
                call.reject("No workspace has that id");
            } catch (JSONException unreadable) {
                call.reject("ProtobaseWorkspaces could not read or save its workspaces");
            } catch (WorkspaceStorage.Failed unsaved) {
                call.reject("ProtobaseWorkspaces could not save its workspaces");
            }
        });
    }

    /** Why the mode cannot run here, or null when it can. */
    private String refusal() {
        Boolean enabled = WorkspacesSetting.enabled(getConfig().getConfigJSON().opt("enabled"));
        if (enabled == null) return "plugins.ProtobaseWorkspaces.enabled takes true or false";
        if (!enabled) return "ProtobaseWorkspaces is off: plugins.ProtobaseWorkspaces.enabled is not true";
        if (bridge.getPlugin("LiveUpdate") != null) return "ProtobaseWorkspaces does not run beside the live updater";
        if (!WorkspaceWebView.supported()) return "ProtobaseWorkspaces needs a WebView with profiles, which keep each workspace's data apart";
        return null;
    }
}
