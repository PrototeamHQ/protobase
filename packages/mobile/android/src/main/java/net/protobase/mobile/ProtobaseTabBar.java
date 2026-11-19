package net.protobase.mobile;

import android.view.ViewGroup;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The shell's mobile bottom bar as the system's navigation bar over the app's web view (NativeTabBar). `set` takes the
 * bar the shell wants, `{ visible, tabs: [{ label, icon }], selected }` (TabBarState), each time it changes, and
 * `visible: false` while the shell shows none; a tap is the `tap` event with the tab's `index`, which the shell navigates
 * on, and the bar's height, in CSS pixels, the navigation bar's inset included, is the `height` event each time it
 * changes, kept for the first listener, so the page keeps that much clear below its content. `set` resolves with
 * `{ height }` too while the bar shows, so a page that starts listening later, as when its bottom bar is drawn again,
 * has it. The bar goes over the view that holds the web view, or over the container an app that puts its web view in a
 * view of its own hands the plugin.
 */
@CapacitorPlugin(name = "ProtobaseTabBar")
public class ProtobaseTabBar extends Plugin {

    private final ViewGroup container;
    private NativeTabBar bar;

    /** Over the view that holds the bridge's web view, as in a Protobase app. */
    public ProtobaseTabBar() {
        this(null);
    }

    /** Over `container`, which holds the bridge's web view and nothing over it. */
    public ProtobaseTabBar(ViewGroup container) {
        this.container = container;
    }

    @PluginMethod
    public void set(PluginCall call) {
        TabBarState state = TabBarState.parse(call.getData());
        if (state == null) {
            call.reject("ProtobaseTabBar.set takes { visible, tabs: [{ label, icon }], selected }, at most " + TabBarState.MAX_TABS + " tabs");
            return;
        }
        getBridge().executeOnMainThread(() -> {
            NativeTabBar made = made();
            if (made == null) {
                call.reject("ProtobaseTabBar has no web view to stand over");
                return;
            }
            made.show(state);
            JSObject answer = new JSObject();
            Double height = made.height();
            if (height != null) answer.put("height", height.doubleValue());
            call.resolve(answer);
        });
    }

    // The bar, made over the web view on first use
    private NativeTabBar made() {
        if (bar != null) return bar;
        ViewGroup into = container != null ? container : getBridge().getWebView().getParent() instanceof ViewGroup parent ? parent : null;
        if (into == null) return null;
        bar = new NativeTabBar(
            into,
            index -> {
                JSObject data = new JSObject();
                data.put("index", index);
                notifyListeners("tap", data);
            },
            height -> {
                JSObject data = new JSObject();
                data.put("height", height);
                notifyListeners("height", data, true);
            }
        );
        return bar;
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        NativeTabBar made = bar;
        bar = null;
        if (made != null) getBridge().executeOnMainThread(made::remove);
    }
}
