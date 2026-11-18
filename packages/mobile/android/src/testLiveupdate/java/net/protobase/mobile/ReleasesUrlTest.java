package net.protobase.mobile;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ReleasesUrlTest {

    private static final String[] LOOPBACK = {
        "http://localhost:3000/api/mobile/releases",
        "http://127.0.0.1/api/mobile/releases",
        "http://[::1]/api/mobile/releases",
    };

    @Test
    public void takesHttpsInEveryBuild() {
        assertTrue(ReleasesUrl.isOwnSource("https://shop.example.com/api/mobile/releases", false));
        assertTrue(ReleasesUrl.isOwnSource("https://shop.example.com/api/mobile/releases", true));
    }

    @Test
    public void takesHttpToTheDeviceInADebuggableBuild() {
        for (String url : LOOPBACK) assertTrue(url, ReleasesUrl.isOwnSource(url, true));
    }

    @Test
    public void refusesHttpToTheDeviceInAReleaseBuild() {
        for (String url : LOOPBACK) assertFalse(url, ReleasesUrl.isOwnSource(url, false));
    }

    @Test
    public void refusesHttpToAnyOtherHostInEveryBuild() {
        for (boolean debuggable : new boolean[] { false, true }) {
            assertFalse(ReleasesUrl.isOwnSource("http://10.0.2.2:3000/api/mobile/releases", debuggable));
            assertFalse(ReleasesUrl.isOwnSource("http://shop.example.com/api/mobile/releases", debuggable));
        }
    }

    @Test
    public void refusesMoreThanAnOriginAndPath() {
        assertFalse(ReleasesUrl.isOwnSource(null, true));
        assertFalse(ReleasesUrl.isOwnSource("https://user@shop.example.com/r", true));
        assertFalse(ReleasesUrl.isOwnSource("https://shop.example.com/r?x=1", true));
        assertFalse(ReleasesUrl.isOwnSource("https://shop.example.com/r#x", true));
        assertFalse(ReleasesUrl.isOwnSource("https:///r", true));
        assertFalse(ReleasesUrl.isOwnSource("https://shop example/r", true));
    }
}
