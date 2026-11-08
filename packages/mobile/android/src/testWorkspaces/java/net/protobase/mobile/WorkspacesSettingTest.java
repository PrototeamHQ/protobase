package net.protobase.mobile;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.json.JSONObject;
import org.junit.Test;

public class WorkspacesSettingTest {

    private static Object parsed(String json) throws Exception {
        return new JSONObject("{\"enabled\":" + json + "}").opt("enabled");
    }

    @Test
    public void onlyJsonTrueTurnsWorkspacesOn() throws Exception {
        assertEquals(true, WorkspacesSetting.enabled(parsed("true")));
        assertEquals(false, WorkspacesSetting.enabled(parsed("false")));
        assertEquals(false, WorkspacesSetting.enabled(new JSONObject().opt("enabled")));
    }

    @Test
    public void refusesAnyOtherValue() throws Exception {
        for (String json : new String[] {"1", "0", "\"true\"", "\"on\"", "null", "{}"}) assertNull(json, WorkspacesSetting.enabled(parsed(json)));
    }
}
