package net.protobase.mobile;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class WorkspaceMessageTest {

    private static final String WORKSPACE = "https://acme.example.com";

    @Test
    public void acceptsOpenDrawerFromItsOwnMainFrame() {
        assertEquals(WorkspaceMessage.OPEN_DRAWER, WorkspaceMessage.accept("openDrawer", true, "https://acme.example.com", WORKSPACE));
        assertEquals(WorkspaceMessage.OPEN_DRAWER, WorkspaceMessage.accept("openDrawer", true, "https://acme.example.com:443", WORKSPACE));
    }

    @Test
    public void refusesAFrame() {
        assertNull(WorkspaceMessage.accept("openDrawer", false, "https://acme.example.com", WORKSPACE));
    }

    @Test
    public void refusesAnotherOrigin() {
        for (String origin : new String[] {"https://evil.example.com", "http://acme.example.com", "https://acme.example.com:8443", "null", "", null}) {
            assertNull(origin, WorkspaceMessage.accept("openDrawer", true, origin, WORKSPACE));
        }
    }

    @Test
    public void refusesAnythingElse() {
        for (String body : new String[] {"", "OpenDrawer", "OPEN_DRAWER", "register", "{\"type\":\"openDrawer\"}", null}) {
            assertNull(body, WorkspaceMessage.accept(body, true, "https://acme.example.com", WORKSPACE));
        }
    }
}
