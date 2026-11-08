package net.protobase.mobile;

import static org.junit.Assert.assertEquals;

import net.protobase.mobile.WorkspaceNavigation.Decision;
import org.junit.Test;

public class WorkspaceNavigationTest {

    private static final String WORKSPACE = "https://acme.example.com";

    private static Decision decide(String url, boolean mainFrame, String method) {
        return WorkspaceNavigation.decide(url, mainFrame, method, WORKSPACE);
    }

    private static Decision decide(String url) {
        return decide(url, true, "GET");
    }

    @Test
    public void loadsItsOwnOriginInTheMainFrame() {
        assertEquals(Decision.LOAD, decide("https://acme.example.com/"));
        assertEquals(Decision.LOAD, decide("https://ACME.example.com:443/tasks/1?tab=a#b"));
        assertEquals(Decision.LOAD, decide("https://acme.example.com/sign-in", true, "POST"));
    }

    @Test
    public void sendsAnotherWebOriginToTheSystemBrowser() {
        String[] urls = {"https://central.example.com/landing", "https://example.org/", "http://acme.example.com/", "https://acme.example.com:8443/",
            "https://acme.example.com.evil.com/"};
        for (String url : urls) assertEquals(url, Decision.OPEN_EXTERNALLY, decide(url));
    }

    @Test
    public void refusesWhatTheSystemBrowserCannotTake() {
        assertEquals(Decision.REFUSE, decide("https://example.org/form", true, "POST"));
        assertEquals(Decision.REFUSE, decide("https://example.org/" + "a".repeat(2048)));
        String[] urls = {"about:blank", "file:///etc/hosts", "data:text/html,hi", "blob:https://acme.example.com/1", "tel:123", "mailto:a@b.c", "intent://x",
            "myapp://x", "javascript:alert(1)", "https://example.org/a b"};
        for (String url : urls) assertEquals(url, Decision.REFUSE, decide(url));
    }

    @Test
    public void loadsFramesAsABrowserDoes() {
        String[] loaded = {"https://acme.example.com/child", "https://video.example.org/embed/1", "about:blank", "about:srcdoc", "blob:https://acme.example.com/1",
            "data:text/html,hi"};
        for (String url : loaded) assertEquals(url, Decision.LOAD, decide(url, false, "GET"));
        String[] refused = {"file:///etc/hosts", "content://x", "intent://x", "myapp://x", "tel:123"};
        for (String url : refused) assertEquals(url, Decision.REFUSE, decide(url, false, "GET"));
    }
}
