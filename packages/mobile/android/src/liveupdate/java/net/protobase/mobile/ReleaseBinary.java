package net.protobase.mobile;

/**
 * This binary: its app id, its native fingerprint and the Protobase version of its shell, from the app's package and
 * capacitor.config.json, beyond page script and a live update. It takes a release only for itself.
 */
final class ReleaseBinary {

    final String appId;
    final String fingerprint;
    final String shellVersion;

    ReleaseBinary(String appId, String fingerprint, String shellVersion) {
        this.appId = appId;
        this.fingerprint = fingerprint;
        this.shellVersion = shellVersion;
    }

    /**
     * Refuses a release for another app or fingerprint, or of a server whose API this shell does not work with: the same
     * major, and below 1.0 the same minor, as the server's `shellUpdateRequired` says.
     */
    void accept(ReleaseStatement statement) throws BundleRefused {
        if (!appId.equals(statement.appId)) throw new BundleRefused("it is a release of another app");
        if (!fingerprint.equals(statement.fingerprint)) throw new BundleRefused("it is a release for another binary");
        long[] own = ReleaseStatement.majorMinor(shellVersion);
        long[] server = ReleaseStatement.majorMinor(statement.shellVersion);
        if (own[0] != server[0] || (server[0] == 0 && own[1] != server[1])) throw new BundleRefused("it is a release for another shell version");
    }
}
