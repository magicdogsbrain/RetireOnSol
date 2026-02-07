package uk.retireonsol.app;

import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor plugin that launches URLs as Android Intents.
 */
@CapacitorPlugin(name = "IntentLauncher")
public class IntentLauncherPlugin extends Plugin {

    private static final String TAG = "IntentLauncher";

    @PluginMethod()
    public void launch(PluginCall call) {
        String url = call.getString("url");
        Log.d(TAG, "launch() called with url: " + url);
        if (url == null || url.isEmpty()) {
            Log.e(TAG, "URL is required");
            call.reject("URL is required");
            return;
        }

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            String targetPackage = call.getString("package");
            if (targetPackage != null && !targetPackage.isEmpty()) {
                intent.setPackage(targetPackage);
                Log.d(TAG, "Targeting package: " + targetPackage);
            }
            Log.d(TAG, "Starting activity for intent: " + url);
            getContext().startActivity(intent);
            Log.d(TAG, "Intent launched successfully");

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Failed to launch intent: " + e.getMessage(), e);
            call.reject("Failed to launch intent: " + e.getMessage());
        }
    }
}
