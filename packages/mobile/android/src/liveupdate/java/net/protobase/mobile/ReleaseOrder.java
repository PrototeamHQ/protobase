package net.protobase.mobile;

import java.util.regex.Pattern;

/**
 * Release orders, compared element by element, a missing element counting as 0, so a later server can add one without
 * breaking binaries already shipped. Kept as text such as `1800000000000,0`.
 */
final class ReleaseOrder {

    /** No order: below every release, the highest order downloaded before the app downloaded any. */
    static final long[] NONE = { 0 };

    // An order the CLI writes: up to 8 elements of up to 19 digits, which parse() still checks for overflow.
    private static final Pattern TEXT = Pattern.compile("[0-9]{1,19}(,[0-9]{1,19}){0,7}");

    private ReleaseOrder() {}

    static int compare(long[] a, long[] b) {
        for (int i = 0; i < Math.max(a.length, b.length); i++) {
            long x = i < a.length ? a[i] : 0;
            long y = i < b.length ? b[i] : 0;
            if (x != y) return x < y ? -1 : 1;
        }
        return 0;
    }

    /**
     * Refuses a bundle of order `next` as the next bundle unless it is above the running one's, `current`, and not below
     * the highest order the app downloaded, `highest`.
     */
    static void acceptNext(long[] next, long[] current, long[] highest) throws BundleRefused {
        if (compare(next, current) <= 0) throw new BundleRefused("it is not newer than the bundle the app runs");
        if (compare(next, highest) < 0) throw new BundleRefused("it is older than a release the app downloaded");
    }

    /**
     * Refuses to download a release of order `order` unless it is above the app's built-in files, `builtIn`, and not
     * below the highest order the app downloaded, `highest`: equal to it is the same release again, which the app
     * downloaded and may still have to set as the next bundle.
     */
    static void acceptDownload(long[] order, long[] builtIn, long[] highest) throws BundleRefused {
        if (compare(order, builtIn) <= 0) throw new BundleRefused("it is not newer than the app's built-in files");
        if (compare(order, highest) < 0) throw new BundleRefused("it is older than a release the app downloaded");
    }

    static String format(long[] order) {
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < order.length; i++) text.append(i == 0 ? "" : ",").append(order[i]);
        return text.toString();
    }

    /**
     * The order the CLI wrote, `plugins.LiveUpdate.builtInOrder`, or null when it is missing, malformed or no order
     * above none, so the guard never runs with a floor of 0.
     */
    static long[] parseBuiltIn(String text) {
        if (text == null || !TEXT.matcher(text).matches()) return null;
        long[] order;
        try {
            order = parse(text);
        } catch (NumberFormatException e) {
            return null;
        }
        return compare(order, NONE) > 0 ? order : null;
    }

    /** The order `text` holds, or none. Only this class writes it. */
    static long[] parse(String text) {
        if (text == null || text.isEmpty()) return NONE;
        String[] parts = text.split(",");
        long[] order = new long[parts.length];
        for (int i = 0; i < parts.length; i++) order[i] = Long.parseLong(parts[i]);
        return order;
    }
}
