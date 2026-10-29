package net.protobase.mobile;

import static net.protobase.mobile.Refusals.refused;
import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class ReleaseOrderTest {

    @Test
    public void comparesElementByElementAMissingOneCountingAsZero() {
        assertEquals(-1, ReleaseOrder.compare(new long[] { 5, 0 }, new long[] { 5, 7 }));
        assertEquals(1, ReleaseOrder.compare(new long[] { 6, 0 }, new long[] { 5, 7 }));
        assertEquals(0, ReleaseOrder.compare(new long[] { 5 }, new long[] { 5, 0 }));
        assertEquals(1, ReleaseOrder.compare(new long[] { 5, 0, 1 }, new long[] { 5 }));
        assertEquals(1, ReleaseOrder.compare(new long[] { 1 }, ReleaseOrder.NONE));
    }

    @Test
    public void takesANextBundleAboveTheRunningOneAndNotBelowTheHighestDownloaded() throws Exception {
        long[] a = { 5, 0 };
        long[] b = { 6, 0 };
        ReleaseOrder.acceptNext(b, ReleaseOrder.NONE, b);
        ReleaseOrder.acceptNext(b, a, b);
        // Downloading A then B, A is no longer taken.
        refused("older than a release the app downloaded", () -> ReleaseOrder.acceptNext(a, ReleaseOrder.NONE, b));
        // Another bundle of the running one's order, or below it.
        refused("not newer than the bundle the app runs", () -> ReleaseOrder.acceptNext(a, a, a));
        refused("not newer than the bundle the app runs", () -> ReleaseOrder.acceptNext(a, b, a));
    }

    @Test
    public void keepsAnOrderAsText() {
        assertEquals("1800000000000,0", ReleaseOrder.format(new long[] { 1_800_000_000_000L, 0 }));
        assertArrayEquals(new long[] { 1_800_000_000_000L, 0 }, ReleaseOrder.parse("1800000000000,0"));
        assertArrayEquals(ReleaseOrder.NONE, ReleaseOrder.parse(null));
    }

    @Test
    public void downloadsOnlyAboveTheBuiltInFilesAndNotBelowTheHighestDownloaded() throws Exception {
        long[] builtIn = { 5, 0 };
        ReleaseOrder.acceptDownload(new long[] { 5, 1 }, builtIn, ReleaseOrder.NONE);
        // The release the app downloaded last, downloaded again.
        ReleaseOrder.acceptDownload(new long[] { 6, 0 }, builtIn, new long[] { 6, 0 });
        refused("not newer than the app's built-in files", () -> ReleaseOrder.acceptDownload(new long[] { 4, 9 }, builtIn, ReleaseOrder.NONE));
        refused("not newer than the app's built-in files", () -> ReleaseOrder.acceptDownload(builtIn, builtIn, ReleaseOrder.NONE));
        refused("older than a release the app downloaded", () -> ReleaseOrder.acceptDownload(new long[] { 6, 0 }, builtIn, new long[] { 7, 0 }));
    }

    @Test
    public void readsTheBuiltInOrderOnlyAsTheCliWritesIt() {
        assertArrayEquals(new long[] { 1_800_000_000_000L, 0 }, ReleaseOrder.parseBuiltIn("1800000000000,0"));
        assertNull(ReleaseOrder.parseBuiltIn(null));
        assertNull(ReleaseOrder.parseBuiltIn(""));
        // Never a floor of 0.
        assertNull(ReleaseOrder.parseBuiltIn("0,0"));
        assertNull(ReleaseOrder.parseBuiltIn("-5,0"));
        assertNull(ReleaseOrder.parseBuiltIn("5, 0"));
        assertNull(ReleaseOrder.parseBuiltIn("[5,0]"));
        assertNull(ReleaseOrder.parseBuiltIn("9999999999999999999,0"));
    }
}
