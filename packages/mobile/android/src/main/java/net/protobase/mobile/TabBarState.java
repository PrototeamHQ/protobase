package net.protobase.mobile;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * What the shell asks the native tab bar to show (`ProtobaseTabBar.set`): its tabs, each a label and its icon as a PNG
 * at 3x, or `search` for the app's search, and which one is current; or, `visible: false`, none. Anything else is no
 * state, which the call is refused for.
 */
final class TabBarState {

    /** One tab: its label, its icon as the base64 of a PNG or none, and whether it is the app's search. */
    record Tab(String label, String icon, boolean search) {}

    static final TabBarState HIDDEN = new TabBarState(null, null);

    /** The system's navigation bar takes five at most, as many places as the shell's bar has (four tabs and More). */
    static final int MAX_TABS = 5;
    /** In characters: a longer label is cut to it, so one long label never leaves the app without its tabs. */
    static final int MAX_LABEL = 64;
    private static final int MAX_ICON = 64 * 1024;
    private static final String PNG_PREFIX = "data:image/png;base64,";

    /** The tabs, in the shell's order; null while hidden. */
    final List<Tab> tabs;
    /** The current tab's index, or null when none is. */
    final Integer selected;

    private TabBarState(List<Tab> tabs, Integer selected) {
        this.tabs = tabs;
        this.selected = selected;
    }

    static TabBarState shown(List<Tab> tabs, Integer selected) {
        return new TabBarState(Collections.unmodifiableList(new ArrayList<>(tabs)), selected);
    }

    boolean visible() {
        return tabs != null;
    }

    static TabBarState parse(JSONObject options) {
        if (!(options.opt("visible") instanceof Boolean visible)) return null;
        if (!visible) return HIDDEN;
        if (!(options.opt("tabs") instanceof JSONArray items) || items.length() == 0 || items.length() > MAX_TABS) return null;
        List<Tab> tabs = new ArrayList<>();
        for (int index = 0; index < items.length(); index++) {
            if (!(items.opt(index) instanceof JSONObject item) || !(item.opt("label") instanceof String label)) return null;
            tabs.add(new Tab(cut(label), icon(item.opt("icon")), Boolean.TRUE.equals(item.opt("search"))));
        }
        Integer selected = options.opt("selected") instanceof Integer index && index >= 0 && index < tabs.size() ? index : null;
        return shown(tabs, selected);
    }

    // At most MAX_LABEL characters, never splitting one
    private static String cut(String label) {
        int count = label.codePointCount(0, label.length());
        return count <= MAX_LABEL ? label : label.substring(0, label.offsetByCodePoints(0, MAX_LABEL));
    }

    // The base64 of a PNG data URL within its size; anything else is no icon
    private static String icon(Object value) {
        if (!(value instanceof String text) || !text.startsWith(PNG_PREFIX) || text.length() > MAX_ICON * 4 / 3 + PNG_PREFIX.length() + 4) return null;
        return text.substring(PNG_PREFIX.length());
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof TabBarState state && Objects.equals(tabs, state.tabs) && Objects.equals(selected, state.selected);
    }

    @Override
    public int hashCode() {
        return Objects.hash(tabs, selected);
    }
}
