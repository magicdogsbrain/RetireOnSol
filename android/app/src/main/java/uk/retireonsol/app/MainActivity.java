package uk.retireonsol.app;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register our custom plugins
        registerPlugin(IntentLauncherPlugin.class);
        registerPlugin(SolanaMWAPlugin.class);
        // Enable WebView debugging so JS console.log shows in logcat
        WebView.setWebContentsDebuggingEnabled(true);
        super.onCreate(savedInstanceState);
    }
}
