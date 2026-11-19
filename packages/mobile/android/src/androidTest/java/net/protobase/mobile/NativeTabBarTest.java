package net.protobase.mobile;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.view.Menu;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.ArrayList;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/** The system's navigation bar as ProtobaseTabBar draws it, on a screen whose app theme is not Material's. */
@RunWith(AndroidJUnit4.class)
public class NativeTabBarTest {

    private ActivityScenario<TabBarTestActivity> scenario;
    private NativeTabBar bar;
    private final List<Integer> taps = new ArrayList<>();
    private final List<Double> heights = new ArrayList<>();

    @Before
    public void open() {
        scenario = ActivityScenario.launch(TabBarTestActivity.class);
        scenario.onActivity(activity -> bar = new NativeTabBar(activity.container, taps::add, heights::add));
    }

    @After
    public void close() {
        scenario.close();
    }

    private static TabBarState.Tab tab(String label) {
        return new TabBarState.Tab(label, null, false);
    }

    private void onMain(Runnable step) {
        scenario.onActivity(activity -> step.run());
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
    }

    @Test
    public void aTabTapIsHandedBack() {
        onMain(() -> bar.show(TabBarState.shown(List.of(tab("Home"), tab("More")), 0)));
        onMain(() -> bar.view().findViewById(2).performClick());
        assertEquals(List.of(1), taps);
        assertEquals(2, bar.view().getSelectedItemId());
    }

    @Test
    public void aSearchTapKeepsTheCurrentTabSelected() {
        onMain(() -> bar.show(TabBarState.shown(List.of(tab("Home"), new TabBarState.Tab("Search", null, true), tab("More")), 0)));
        onMain(() -> bar.view().findViewById(2).performClick());
        assertEquals(List.of(1), taps);
        assertEquals(1, bar.view().getSelectedItemId());
    }

    @Test
    public void showsNoTabAsCurrentWhenNoneIs() {
        onMain(() -> bar.show(TabBarState.shown(List.of(tab("Home"), tab("More")), null)));
        Menu menu = bar.view().getMenu();
        assertFalse(menu.getItem(0).isChecked());
        assertFalse(menu.getItem(1).isChecked());
    }

    @Test
    public void tellsItsHeightWhileItShows() {
        assertNull(bar.height());
        onMain(() -> bar.show(TabBarState.shown(List.of(tab("Home"), tab("More")), 0)));
        Double height = bar.height();
        assertNotNull(height);
        assertTrue(height > 0);
        // Each change is told, the last as the bar is now, once the navigation bar's inset is in
        assertEquals(height, heights.get(heights.size() - 1));
        onMain(() -> bar.show(TabBarState.HIDDEN));
        assertNull(bar.height());
    }
}
