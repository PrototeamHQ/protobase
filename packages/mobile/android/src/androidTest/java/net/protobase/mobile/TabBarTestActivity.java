package net.protobase.mobile;

import android.os.Bundle;
import android.widget.FrameLayout;
import androidx.appcompat.app.AppCompatActivity;

/** A screen on an app theme that is not Material's, as a Capacitor app's is, holding only the container the bar goes over. */
public class TabBarTestActivity extends AppCompatActivity {

    FrameLayout container;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        container = new FrameLayout(this);
        setContentView(container);
    }
}
