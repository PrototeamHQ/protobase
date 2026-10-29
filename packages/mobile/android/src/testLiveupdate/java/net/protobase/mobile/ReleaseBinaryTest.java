package net.protobase.mobile;

import static net.protobase.mobile.Refusals.refused;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import org.junit.Test;

public class ReleaseBinaryTest {

    private static final KeyPair KEY = TestRelease.newKey();

    private static ReleaseStatement statement(String appId, String fingerprint, String shell) throws Exception {
        TestRelease release = TestRelease.of(KEY, new long[] { 1 }, TestRelease.files(), "[]".getBytes(StandardCharsets.UTF_8), appId, fingerprint, shell);
        return ReleaseStatement.verify(release.statement, release.bundleId, KEY.getPublic());
    }

    @Test
    public void takesAReleaseForThisAppBinaryAndAShellOfTheSameMinorBelowOne() throws Exception {
        TestRelease.BINARY.accept(statement(TestRelease.APP_ID, TestRelease.FINGERPRINT, "0.14.9"));
        new ReleaseBinary(TestRelease.APP_ID, TestRelease.FINGERPRINT, "1.2.0").accept(statement(TestRelease.APP_ID, TestRelease.FINGERPRINT, "1.5.1"));
    }

    @Test
    public void refusesAReleaseForAnotherAppBinaryOrShell() throws Exception {
        refused("another app", () -> TestRelease.BINARY.accept(statement("com.example.other", TestRelease.FINGERPRINT, TestRelease.SHELL)));
        refused("another binary", () -> TestRelease.BINARY.accept(statement(TestRelease.APP_ID, "fedcba9876543210", TestRelease.SHELL)));
        refused("another shell version", () -> TestRelease.BINARY.accept(statement(TestRelease.APP_ID, TestRelease.FINGERPRINT, "0.15.0")));
        refused("another shell version", () -> new ReleaseBinary(TestRelease.APP_ID, TestRelease.FINGERPRINT, "1.2.0").accept(statement(TestRelease.APP_ID, TestRelease.FINGERPRINT, "2.0.0")));
    }
}
