package net.protobase.mobile;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** Asserts that a check refuses, with a reason that says why. */
final class Refusals {

    interface Check {
        void run() throws Exception;
    }

    static void refused(String reason, Check check) throws Exception {
        try {
            check.run();
        } catch (BundleRefused e) {
            assertTrue("refused for \"" + e.getMessage() + "\", not for \"" + reason + "\"", e.getMessage().contains(reason));
            return;
        }
        fail("not refused: " + reason);
    }
}
