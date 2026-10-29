package net.protobase.mobile;

import static net.protobase.mobile.Refusals.refused;
import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class ReleaseOrderTest {

    @Test
    public void comparesElementByElementAMissingOneCountingAsZero() {
        assertEquals(-1, ReleaseOrder.compare(new long[] { 5, 0 }, new long[] { 5, 7 }));
        assertEquals(1, ReleaseOrder.compare(new long[] { 6, 0 }, new long[] { 5, 7 }));
        assertEquals(0, ReleaseOrder.compare(new long[] { 5 }, new long[] { 5, 0 }));
        assertEquals(1, ReleaseOrder.compare(new long[] { 5, 0, 1 }, new long[] { 5 }));
        assertEquals(1, ReleaseOrder.compare(new long[] { 1 }, ReleaseOrder.BUILT_IN));
    }

    @Test
    public void takesANextBundleAboveTheRunningOneAndNotBelowTheHighestDownloaded() throws Exception {
        long[] a = { 5, 0 };
        long[] b = { 6, 0 };
        ReleaseOrder.acceptNext(b, ReleaseOrder.BUILT_IN, b);
        ReleaseOrder.acceptNext(b, a, b);
        // Downloading A then B, A is no longer taken.
        refused("older than a release the app downloaded", () -> ReleaseOrder.acceptNext(a, ReleaseOrder.BUILT_IN, b));
        // Another bundle of the running one's order, or below it.
        refused("not newer than the bundle the app runs", () -> ReleaseOrder.acceptNext(a, a, a));
        refused("not newer than the bundle the app runs", () -> ReleaseOrder.acceptNext(a, b, a));
    }

    @Test
    public void keepsAnOrderAsText() {
        assertEquals("1800000000000,0", ReleaseOrder.format(new long[] { 1_800_000_000_000L, 0 }));
        assertArrayEquals(new long[] { 1_800_000_000_000L, 0 }, ReleaseOrder.parse("1800000000000,0"));
        assertArrayEquals(ReleaseOrder.BUILT_IN, ReleaseOrder.parse(null));
    }
}
