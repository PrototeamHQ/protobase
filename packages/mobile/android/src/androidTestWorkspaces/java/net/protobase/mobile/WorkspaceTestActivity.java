package net.protobase.mobile;

import android.app.Activity;
import android.os.Bundle;
import android.widget.FrameLayout;

/** A bare screen the workspace view tests put their WebViews on, as the shell puts them over its home view. */
public class WorkspaceTestActivity extends Activity {

    FrameLayout container;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        container = new FrameLayout(this);
        setContentView(container);
    }
}
