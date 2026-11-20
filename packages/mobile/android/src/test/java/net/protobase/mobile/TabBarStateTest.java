package net.protobase.mobile;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.Base64;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** What `ProtobaseTabBar.set` takes from the shell. */
public class TabBarStateTest {

    private static final String PNG_BASE64 = Base64.getEncoder().encodeToString(new byte[] { (byte) 0x89, 0x50, 0x4e, 0x47 });
    private static final String PNG = "data:image/png;base64," + PNG_BASE64;

    private static TabBarState parse(String json) throws Exception {
        return TabBarState.parse(new JSONObject(json));
    }

    private static TabBarState.Tab tab(String label) {
        return new TabBarState.Tab(label, null, false);
    }

    @Test
    public void takesTabsAndTheCurrentOne() throws Exception {
        TabBarState state = parse("{\"visible\":true,\"tabs\":[{\"label\":\"Home\",\"icon\":\"" + PNG + "\"},{\"label\":\"More\",\"icon\":null}],\"selected\":1}");
        assertEquals(TabBarState.shown(List.of(new TabBarState.Tab("Home", PNG_BASE64, false), tab("More")), 1), state);
    }

    @Test
    public void takesTheSearchTab() throws Exception {
        TabBarState state = parse("{\"visible\":true,\"tabs\":[{\"label\":\"Home\"},{\"label\":\"Search\",\"search\":true}]}");
        assertEquals(TabBarState.shown(List.of(tab("Home"), new TabBarState.Tab("Search", null, true)), null), state);
    }

    @Test
    public void takesNoBar() throws Exception {
        assertEquals(TabBarState.HIDDEN, parse("{\"visible\":false}"));
    }

    @Test
    public void aCurrentTabOutsideTheTabsIsNone() throws Exception {
        assertEquals(TabBarState.shown(List.of(tab("Home")), null), parse("{\"visible\":true,\"tabs\":[{\"label\":\"Home\"}],\"selected\":null}"));
        assertEquals(TabBarState.shown(List.of(tab("Home")), null), parse("{\"visible\":true,\"tabs\":[{\"label\":\"Home\"}],\"selected\":4}"));
    }

    @Test
    public void refusesAnythingElse() throws Exception {
        assertNull(parse("{}"));
        assertNull(parse("{\"visible\":\"yes\"}"));
        assertNull(parse("{\"visible\":true,\"tabs\":[]}"));
        JSONArray tooMany = new JSONArray();
        for (int index = 0; index <= TabBarState.MAX_TABS; index++) tooMany.put(new JSONObject().put("label", "x"));
        assertNull(TabBarState.parse(new JSONObject().put("visible", true).put("tabs", tooMany)));
        assertNull(parse("{\"visible\":true,\"tabs\":[{\"icon\":\"" + PNG + "\"}]}"));
    }

    @Test
    public void cutsALongLabelAndKeepsTheOtherTabs() throws Exception {
        String longLabel = "😀".repeat(TabBarState.MAX_LABEL + 1);
        TabBarState state = TabBarState.parse(new JSONObject().put("visible", true).put("tabs", new JSONArray().put(new JSONObject().put("label", longLabel)).put(new JSONObject().put("label", "More"))));
        assertEquals(TabBarState.shown(List.of(tab("😀".repeat(TabBarState.MAX_LABEL)), tab("More")), null), state);
    }

    @Test
    public void anIconThatIsNoPngIsNone() throws Exception {
        assertEquals(TabBarState.shown(List.of(tab("Home")), null), parse("{\"visible\":true,\"tabs\":[{\"label\":\"Home\",\"icon\":\"data:image/svg+xml,<svg/>\"}]}"));
    }
}
