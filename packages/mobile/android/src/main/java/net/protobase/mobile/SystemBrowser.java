package net.protobase.mobile;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import androidx.browser.customtabs.CustomTabsIntent;

/**
 * Opens a URL in the system browser over the app, in a Custom Tab, apart from every workspace's profile. On a phone
 * with no browser, it opens nothing.
 */
final class SystemBrowser {

    private SystemBrowser() {}

    /** Opens the URL in a Custom Tab, as a new task when the context is no activity; with no browser on the phone, nothing opens. */
    static void open(Context context, String url) {
        CustomTabsIntent tab = new CustomTabsIntent.Builder().build();
        if (!(context instanceof Activity)) tab.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            tab.launchUrl(context, Uri.parse(url));
        } catch (ActivityNotFoundException noBrowser) {
            return;
        }
    }
}
