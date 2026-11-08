package net.protobase.mobile;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import org.json.JSONArray;
import org.json.JSONException;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Workspace views on a device, on pages of a loopback server: two workspaces at one origin, each on its own profile, so
 * a shared profile would show in the second whatever the first set. Another origin is the same server by another host
 * name.
 */
@RunWith(AndroidJUnit4.class)
public class WorkspaceWebViewTest {

    private static final Map<String, TestSite.Page> PAGES = Map.of(
        "/", new TestSite.Page("<!doctype html><title>home</title>"),
        "/sign-in", new TestSite.Page(
            "<!doctype html><script>document.cookie = 'page=a; path=/'; localStorage.setItem('k', 'a')</script>",
            Map.of("Set-Cookie", "session=a; Path=/; HttpOnly")),
        "/echo", new TestSite.Page("<!doctype html><p id=cookie>{cookie}</p>"),
        "/frames", new TestSite.Page("<!doctype html><script>"
            + "window.seen = []; addEventListener('message', (event) => window.seen.push(event.data));"
            + "for (const src of ['/child', `http://localhost:${location.port}/child`]) {"
            + "  const frame = document.createElement('iframe'); frame.src = src; document.documentElement.append(frame) }"
            + "</script>"),
        "/child", new TestSite.Page("<!doctype html><script>"
            + "const kind = typeof protobaseApp; if (kind === 'object') protobaseApp.postMessage('openDrawer'); parent.postMessage(kind, '*')"
            + "</script>"),
        // A main frame with an opaque origin, though its URL is the workspace's.
        "/sandboxed", new TestSite.Page(
            "<!doctype html><script>document.title = typeof protobaseApp; if (typeof protobaseApp === 'object') protobaseApp.postMessage('openDrawer')</script>",
            Map.of("Content-Security-Policy", "sandbox allow-scripts")),
        "/links", new TestSite.Page("<!doctype html><a id=out>out</a><a id=after>after</a><form id=post method=post><input name=a value=1></form><script>"
            + "const other = `http://localhost:${location.port}`;"
            + "document.getElementById('out').href = `${other}/elsewhere`;"
            + "document.getElementById('after').href = `${other}/after`;"
            + "document.getElementById('post').action = `${other}/form`"
            + "</script>"));

    private TestSite site;
    private ActivityScenario<WorkspaceTestActivity> scenario;
    private final List<WebView> views = new ArrayList<>();
    private final List<String> opened = new CopyOnWriteArrayList<>();
    private final List<WorkspaceMessage> messages = new CopyOnWriteArrayList<>();

    @Before
    public void start() throws Exception {
        assertTrue("This WebView has no profiles or message listeners", WorkspaceWebView.supported());
        site = new TestSite(PAGES);
        scenario = ActivityScenario.launch(WorkspaceTestActivity.class);
    }

    @After
    public void stop() throws Exception {
        onMain(() -> views.forEach(WebView::destroy));
        scenario.close();
        site.close();
    }

    @Test
    public void cookiesAndStorageStayInTheirWorkspace() throws Exception {
        String store = UUID.randomUUID().toString();
        WebView a = make(store);
        go(a, "/sign-in");
        go(a, "/echo");
        String cookies = js(a, "document.getElementById('cookie').textContent");
        assertTrue(cookies, cookies.contains("session=a") && cookies.contains("page=a"));
        // A's profile in a second view, as its workspace opens after the app restarted: what A set is there, so it has
        // reached the profile before B looks.
        WebView again = make(store);
        go(again, "/echo");
        String againCookies = js(again, "document.getElementById('cookie').textContent");
        assertTrue(againCookies, againCookies.contains("session=a"));
        until("A's storage shows in its profile again", () -> js(again, "String(localStorage.getItem('k'))").equals("a"));
        WebView b = make(UUID.randomUUID().toString());
        go(b, "/echo");
        assertEquals("|", js(b, "document.getElementById('cookie').textContent + '|' + document.cookie"));
        assertEquals("null", js(b, "String(localStorage.getItem('k'))"));
    }

    @Test
    public void theChannelTakesOnlyItsOwnMainFrame() throws Exception {
        WebView a = make(UUID.randomUUID().toString());
        go(a, "/sandboxed");
        assertEquals("undefined", js(a, "document.title"));
        go(a, "/frames");
        until("both frames posted", () -> js(a, "String(window.seen.length)").equals("2"));
        // Only the workspace's own frame gets the object; it posted, and is not heard, as the sandboxed page is not.
        JSONArray seen = new JSONArray(js(a, "JSON.stringify(window.seen.sort())"));
        assertEquals("[\"object\",\"undefined\"]", seen.toString());
        js(a, "protobaseApp.postMessage('register'), 'posted'");
        js(a, "protobaseApp.postMessage('openDrawer'), 'posted'");
        until("the main frame's message arrived", () -> !messages.isEmpty());
        assertEquals(List.of(WorkspaceMessage.OPEN_DRAWER), messages);
    }

    @Test
    public void anotherOriginLeavesForTheSystemBrowser() throws Exception {
        WebView a = make(UUID.randomUUID().toString());
        go(a, "/links");
        js(a, "document.getElementById('out').click(), 'clicked'");
        until("the link reached the system browser", () -> opened.size() == 1);
        js(a, "document.getElementById('post').submit(), 'submitted'");
        js(a, "document.getElementById('after').click(), 'clicked'");
        until("the second link reached the system browser", () -> opened.size() == 2);
        String other = "http://localhost:" + site.port();
        // The form's POST to another origin went nowhere: the browser cannot carry its body.
        assertEquals(List.of(other + "/elsewhere", other + "/after"), opened);
        until("the view stays on its page", () -> js(a, "location.href + '|' + document.readyState").equals(origin() + "/links|complete"));
    }

    /** The test site's origin. */
    private String origin() {
        return "http://127.0.0.1:" + site.port();
    }

    /** A workspace view on the profile `store`, for the test site's origin, on the test screen. */
    private WebView make(String store) throws Exception {
        Workspace workspace = new Workspace(store, origin(), null, null);
        AtomicReference<WebView> made = new AtomicReference<>();
        scenario.onActivity(activity -> {
            WebView view = WorkspaceWebView.make(activity, workspace, opened::add, messages::add);
            activity.container.addView(view, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
            made.set(view);
        });
        views.add(made.get());
        return made.get();
    }

    /** Loads `path` of the test site in `view` and waits until it has loaded. */
    private void go(WebView view, String path) throws Exception {
        onMain(() -> view.loadUrl(origin() + path));
        until(path + " loaded", () -> js(view, "location.pathname + '|' + document.readyState").equals(path + "|complete"));
    }

    /** The script's result as a string: evaluateJavascript hands it over as JSON. */
    private String js(WebView view, String script) {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        onMain(() -> view.evaluateJavascript(script, value -> {
            result.set(value);
            done.countDown();
        }));
        try {
            if (!done.await(10, TimeUnit.SECONDS)) throw new AssertionError("No answer to " + script);
        } catch (InterruptedException e) {
            throw new AssertionError(e);
        }
        String value = result.get();
        if (value == null || value.equals("null")) return "";
        if (!value.startsWith("\"")) return value;
        try {
            return new JSONArray("[" + value + "]").getString(0);
        } catch (JSONException e) {
            throw new AssertionError(e);
        }
    }

    /** Waits until `condition` holds, failing with `what` when it does not in time. */
    private static void until(String what, BooleanSupplier condition) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 15_000;
        while (!condition.getAsBoolean()) {
            if (System.currentTimeMillis() > deadline) throw new AssertionError("Timed out: " + what);
            Thread.sleep(50);
        }
    }

    /** Runs `runnable` on the main thread and waits for it. */
    private static void onMain(Runnable runnable) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(runnable);
    }
}
