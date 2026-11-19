package net.protobase.mobile;

import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.BitmapDrawable;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.ContextThemeWrapper;
import android.view.Gravity;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import com.google.android.material.bottomnavigation.BottomNavigationView;
import com.google.android.material.color.DynamicColors;
import com.google.android.material.navigation.NavigationBarView;
import java.util.function.DoubleConsumer;
import java.util.function.IntConsumer;

/**
 * The system's navigation bar over the bottom of a web view, in the system's own colours where the phone has them: its
 * tabs and current tab as the shell asks (TabBarState), a tap handed back by index, and its height in the page's CSS
 * pixels, the navigation bar's inset below it included, so the page can keep that much clear. Hidden while the shell
 * shows no bottom bar. Android has no search item of its own, so search is a tab like the others, in its place. The bar
 * sits on a layer of its own over the whole container, which takes no touch itself, and is made again when the phone
 * turns dark or light, so its colours follow. On the main thread.
 */
final class NativeTabBar {

    private final FrameLayout layer;
    private final IntConsumer onTap;
    private final DoubleConsumer onHeight;
    private BottomNavigationView bar;
    private TabBarState shown = TabBarState.HIDDEN;
    private int told = -1;

    NativeTabBar(ViewGroup container, IntConsumer onTap, DoubleConsumer onHeight) {
        this.onTap = onTap;
        this.onHeight = onHeight;
        layer = new FrameLayout(container.getContext()) {
            private int night = night(getResources().getConfiguration());

            @Override
            protected void onConfigurationChanged(Configuration configuration) {
                super.onConfigurationChanged(configuration);
                if (night(configuration) == night) return;
                night = night(configuration);
                make();
            }
        };
        container.addView(layer, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        make();
    }

    private static int night(Configuration configuration) {
        return configuration.uiMode & Configuration.UI_MODE_NIGHT_MASK;
    }

    /** The bar, in the phone's current colours, showing what was shown. */
    private void make() {
        if (bar != null) layer.removeView(bar);
        // Material's bar needs its own theme, which the app's need not be
        Context themed = DynamicColors.wrapContextIfAvailable(new ContextThemeWrapper(layer.getContext(), com.google.android.material.R.style.Theme_Material3_DayNight_NoActionBar));
        BottomNavigationView made = new BottomNavigationView(themed);
        made.setLabelVisibilityMode(NavigationBarView.LABEL_VISIBILITY_LABELED);
        made.setTag("Tabs");
        made.setContentDescription("Tabs");
        // Each item's id is its tab's index plus one, as 0 is no id; search only opens the shell's search, so the
        // current tab stays as the shell last asked, and a tab becomes current once the shell navigates and asks for it
        made.setOnItemSelectedListener(item -> {
            int index = item.getItemId() - 1;
            onTap.accept(index);
            return !(shown.visible() && index < shown.tabs.size() && shown.tabs.get(index).search());
        });
        made.setOnItemReselectedListener(item -> onTap.accept(item.getItemId() - 1));
        made.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> tell());
        bar = made;
        told = -1;
        layer.addView(made, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));
        TabBarState state = shown;
        shown = TabBarState.HIDDEN;
        draw(state);
    }

    void show(TabBarState state) {
        if (state.equals(shown)) return;
        draw(state);
    }

    private void draw(TabBarState state) {
        shown = state;
        if (!state.visible()) {
            bar.setVisibility(View.GONE);
            return;
        }
        Menu menu = bar.getMenu();
        menu.clear();
        for (int index = 0; index < state.tabs.size(); index++) {
            TabBarState.Tab tab = state.tabs.get(index);
            MenuItem item = menu.add(Menu.NONE, index + 1, index, tab.label());
            if (tab.icon() != null) item.setIcon(icon(tab.icon()));
        }
        if (state.selected != null) {
            menu.setGroupCheckable(Menu.NONE, true, true);
            menu.findItem(state.selected + 1).setChecked(true);
        } else {
            // The bar checks its first item as it is added: with no current tab, none shows as one, nor is checked after
            menu.setGroupCheckable(Menu.NONE, true, false);
            for (int index = 0; index < menu.size(); index++) menu.getItem(index).setChecked(false);
            menu.setGroupCheckable(Menu.NONE, false, true);
        }
        bar.setVisibility(View.VISIBLE);
    }

    // The PNG at 3x, or none when it is no image
    private BitmapDrawable icon(String base64) {
        Bitmap bitmap;
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (IllegalArgumentException e) {
            return null;
        }
        if (bitmap == null) return null;
        bitmap.setDensity(DisplayMetrics.DENSITY_XXHIGH);
        return new BitmapDrawable(layer.getResources(), bitmap);
    }

    /** The bar's height while it shows, in CSS pixels, the navigation bar's inset included; none while hidden or not laid out. */
    Double height() {
        if (bar.getVisibility() != View.VISIBLE || bar.getHeight() == 0) return null;
        return css(bar.getHeight());
    }

    private void tell() {
        if (bar.getVisibility() != View.VISIBLE || bar.getHeight() == told) return;
        told = bar.getHeight();
        onHeight.accept(css(told));
    }

    private double css(int pixels) {
        return pixels / (double) layer.getResources().getDisplayMetrics().density;
    }

    /** What the bar shows now. */
    TabBarState shown() {
        return shown;
    }

    /** The bar itself, for tests. */
    BottomNavigationView view() {
        return bar;
    }

    /** Takes the bar off the screen. */
    void remove() {
        if (layer.getParent() instanceof ViewGroup parent) parent.removeView(layer);
    }
}
