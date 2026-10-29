package net.protobase.mobile;

/**
 * Release orders, compared element by element, a missing element counting as 0, so a later server can add one without
 * breaking binaries already shipped. Kept as text such as `1800000000000,0`.
 */
final class ReleaseOrder {

    /** The built-in bundle's order. */
    static final long[] BUILT_IN = { 0 };

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

    static String format(long[] order) {
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < order.length; i++) text.append(i == 0 ? "" : ",").append(order[i]);
        return text.toString();
    }

    /** The order `text` holds, or the built-in bundle's for none. Only this class writes it. */
    static long[] parse(String text) {
        if (text == null || text.isEmpty()) return BUILT_IN;
        String[] parts = text.split(",");
        long[] order = new long[parts.length];
        for (int i = 0; i < parts.length; i++) order[i] = Long.parseLong(parts[i]);
        return order;
    }
}
