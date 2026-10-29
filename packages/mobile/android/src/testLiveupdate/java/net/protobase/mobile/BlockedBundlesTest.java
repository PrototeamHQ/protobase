package net.protobase.mobile;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class BlockedBundlesTest {

    @Test
    public void blocksAListedIdOnly() {
        assertTrue(BlockedBundles.blocks("a1,b2", "b2"));
        assertFalse(BlockedBundles.blocks("a1,b2", "c3"));
    }

    @Test
    public void blocksNothingWithoutAList() {
        assertFalse(BlockedBundles.blocks(null, "a1"));
        assertFalse(BlockedBundles.blocks("", "a1"));
    }

    @Test
    public void blocksEveryIdWhenTheListCannotBeRead() {
        assertTrue(BlockedBundles.blocks("a1,,b2", "c3"));
        assertTrue(BlockedBundles.blocks("[\"a1\"]", "c3"));
        assertTrue(BlockedBundles.blocks("a1;b2", "c3"));
    }
}
