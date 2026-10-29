package net.protobase.mobile;

/** Why the guard refuses a release or a bundle: its message says so to page script, never a library's own message. */
final class BundleRefused extends Exception {

    BundleRefused(String reason) {
        super(reason);
    }
}
