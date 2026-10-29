package net.protobase.mobile;

import java.util.Arrays;
import java.util.regex.Pattern;

/**
 * The bundles the stock plugin blocked after rolling them back (`autoBlockRolledBackBundles`): ready() adds the id
 * of a bundle that never got ready (LiveUpdate.java:460-462 of @capawesome/capacitor-live-update 8.7.1) to a comma
 * separated list in its preferences (LiveUpdatePreferences.java:19, LiveUpdate.java:1510-1537). The stock code reads it
 * only in sync(), which the guard refuses, so the guard reads it itself.
 */
final class BlockedBundles {

    /** The stock plugin's key, which its source marks "DO NOT CHANGE". */
    static final String KEY = "blockedBundleIds";

    // The ids the guard lets reach the stock code are bundle ids (BundlesFolder), so a list holding anything else is
    // one the guard cannot read, as after a plugin upgrade that changed its format.
    private static final Pattern ID = Pattern.compile("[A-Za-z0-9_-]{1,64}");

    private BlockedBundles() {}

    /** Whether `list`, the stock plugin's, blocks `bundleId`; any id when the list cannot be read, so it fails closed. */
    static boolean blocks(String list, String bundleId) {
        if (list == null || list.isEmpty()) return false;
        String[] ids = list.split(",", -1);
        for (String id : ids) if (!ID.matcher(id).matches()) return true;
        return Arrays.asList(ids).contains(bundleId);
    }
}
