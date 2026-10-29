package android.content;

import java.io.File;

/** The part of Android's Context that BundlesFolder names, so its checks compile and run on a plain JVM. */
public abstract class Context {

    public abstract File getFilesDir();
}
