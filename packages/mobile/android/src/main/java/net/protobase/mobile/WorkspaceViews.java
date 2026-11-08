package net.protobase.mobile;

import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import java.util.HashMap;
import java.util.Map;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * The workspace views in front of the home view, each made the first time its workspace opens and kept until it is
 * removed, so at most one per listed workspace. One shows at a time; the home view shows when none does. Main thread
 * only.
 */
final class WorkspaceViews {

    private final Supplier<ViewGroup> container;
    private final Consumer<String> openExternally;
    private final BiConsumer<Workspace, WorkspaceMessage> onMessage;
    private final Map<String, WebView> views = new HashMap<>();

    WorkspaceViews(Supplier<ViewGroup> container, Consumer<String> openExternally, BiConsumer<Workspace, WorkspaceMessage> onMessage) {
        this.container = container;
        this.openExternally = openExternally;
        this.onMessage = onMessage;
    }

    /** The view made for the workspace with `id`, or null when none is. */
    WebView view(String id) {
        return views.get(id);
    }

    /** Shows the workspace's view in front, making it the first time; false when there is no screen or the view cannot be made. */
    boolean show(Workspace workspace) {
        ViewGroup parent = container.get();
        if (parent == null) return false;
        WebView view = views.containsKey(workspace.id) ? views.get(workspace.id) : make(parent, workspace);
        if (view == null) return false;
        for (WebView other : views.values()) other.setVisibility(other == view ? View.VISIBLE : View.GONE);
        if (view.getParent() == null) parent.addView(view, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        view.bringToFront();
        return true;
    }

    /** Hides every workspace view. */
    void showHome() {
        for (WebView view : views.values()) view.setVisibility(View.GONE);
    }

    /** Takes the workspace's view off the screen and destroys it, if one was made. */
    void close(String id) {
        WebView view = views.remove(id);
        if (view == null) return;
        if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
        view.destroy();
    }

    /** Makes and loads the workspace's view, or null when WorkspaceWebView cannot make it. */
    private WebView make(ViewGroup parent, Workspace workspace) {
        WebView view = WorkspaceWebView.make(parent.getContext(), workspace, openExternally, message -> onMessage.accept(workspace, message));
        if (view == null) return null;
        views.put(workspace.id, view);
        view.loadUrl(WorkspaceOrigin.parse(workspace.origin));
        return view;
    }
}
