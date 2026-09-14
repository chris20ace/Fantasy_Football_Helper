package dev.acebuilds.sundaydesk;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebMessageCompat;
import java.util.Collections;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private WebView webView;
    private long documentVersion = 0;
    private int nextActivityRequest = 731;
    private Pending pending;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable timeout = () -> cancelPending("TIMEOUT", "ESPN sign-in timed out. Please try again.");

    private static final class Pending {
        final String id;
        final long document;
        final int activityRequest;
        final JavaScriptReplyProxy reply;
        Pending(String id, long document, int activityRequest, JavaScriptReplyProxy reply) {
            this.id = id; this.document = document; this.activityRequest = activityRequest; this.reply = reply;
        }
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) { return true; }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                String destination = request.getUrl().toString();
                if (UrlPolicy.isApp(destination)) return false;
                cancelPending("CANCELLED", "ESPN connection cancelled.");
                // External HTTPS links never load in a WebView that owns our bridge.
                if ("https".equals(request.getUrl().getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); }
                    catch (Exception ignored) { showNotice("No browser is available to open that link."); }
                }
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap icon) {
                cancelPending("CANCELLED", "The page changed. Start the connection again.");
                documentVersion++;
                if (!UrlPolicy.isApp(url)) { view.stopLoading(); view.loadUrl(UrlPolicy.SETUP_URL); }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showNotice("Sunday Desk could not load. Check your connection and reopen the app.");
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                cancelPending("CANCELLED", "The app was interrupted. Please reopen Sunday Desk.");
                view.destroy();
                finish();
                return true;
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, "SundayDeskEspn", Collections.singleton(UrlPolicy.APP_ORIGIN),
                (view, message, origin, isMainFrame, reply) -> {
                    if (message.getType() == WebMessageCompat.TYPE_STRING) receive(message.getData(), origin, isMainFrame, reply);
                });
        }
        // Android 15+ uses edge-to-edge by default. Keep web controls above native insets.
        webView.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), Math.max(insets.getSystemWindowInsetBottom(), 0));
            return insets.consumeSystemWindowInsets();
        });
        setContentView(webView);
        webView.loadUrl(UrlPolicy.SETUP_URL);
    }

    private void receive(String raw, Uri origin, boolean isMainFrame, JavaScriptReplyProxy reply) {
        if (raw == null || raw.length() > 512) return;
        try {
            JSONObject input = new JSONObject(raw);
            String id = input.optString("requestId", "");
            String command = input.optString("command", "");
            if (!UrlPolicy.isRequestId(id)) return;
            if (!isMainFrame || !UrlPolicy.isApp(origin.toString()) || !UrlPolicy.isSetup(webView.getUrl())) {
                reply.postMessage(BridgeResponse.error(id, command, "UNTRUSTED_ORIGIN", "Open Sunday Desk Setup to connect ESPN.").toString());
                return;
            }
            switch (command) {
                case "status":
                    reply.postMessage(BridgeResponse.success(id, command).put("available", true).put("version", 1).toString());
                    break;
                case "connect":
                    if (pending != null) {
                        reply.postMessage(BridgeResponse.error(id, command, "BUSY", "An ESPN connection is already open.").toString());
                        return;
                    }
                    nextActivityRequest = nextActivityRequest >= 65534 ? 731 : nextActivityRequest + 1;
                    pending = new Pending(id, documentVersion, nextActivityRequest, reply);
                    handler.postDelayed(timeout, 10 * 60 * 1000L);
                    Intent login = new Intent(this, EspnSignInActivity.class);
                    login.putExtra("requestId", id);
                    startActivityForResult(login, pending.activityRequest);
                    break;
                case "cancel":
                    if (pending != null && pending.id.equals(id)) cancelPending("CANCELLED", "ESPN connection cancelled.");
                    reply.postMessage(BridgeResponse.success(id, command).toString());
                    break;
                default:
                    reply.postMessage(BridgeResponse.error(id, command, "UNSUPPORTED", "Unknown ESPN connector command.").toString());
            }
        } catch (Exception ignored) {
            // Deliberately never log bridge bodies, cookie values, or exception payloads.
            cancelPending("FAILED", "The ESPN connector could not start. Please try again.");
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (pending == null || requestCode != pending.activityRequest) return;
        Pending operation = pending;
        pending = null;
        handler.removeCallbacks(timeout);
        if (operation.document != documentVersion || !UrlPolicy.isSetup(webView.getUrl())) return;
        if (resultCode != RESULT_OK || data == null || !operation.id.equals(data.getStringExtra("requestId"))) {
            operation.reply.postMessage(BridgeResponse.error(operation.id, "connect", "CANCELLED", "ESPN connection cancelled.").toString());
            return;
        }
        String s2 = data.getStringExtra("s2");
        String swid = data.getStringExtra("swid");
        data.removeExtra("s2"); data.removeExtra("swid");
        if (!EspnSession.isValid(s2, swid)) {
            operation.reply.postMessage(BridgeResponse.error(operation.id, "connect", "SESSION_MISSING", "Sign in to ESPN and try again.").toString());
            return;
        }
        try {
            operation.reply.postMessage(BridgeResponse.success(operation.id, "connect").put("s2", s2).put("swid", swid).toString());
        } catch (Exception ignored) { /* Never fall back to a URL or another document. */ }
    }

    private void cancelPending(String code, String message) {
        Pending operation = pending;
        pending = null;
        handler.removeCallbacks(timeout);
        if (operation == null) return;
        finishActivity(operation.activityRequest);
        if (webView != null && operation.document == documentVersion && UrlPolicy.isSetup(webView.getUrl())) {
            try { operation.reply.postMessage(BridgeResponse.error(operation.id, "connect", code, message).toString()); }
            catch (Exception ignored) { /* The original JavaScript frame may already be gone. */ }
        }
    }

    private void showNotice(String message) {
        if (!isFinishing()) new AlertDialog.Builder(this).setTitle("Sunday Desk").setMessage(message).setPositiveButton("OK", null).show();
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        cancelPending("CANCELLED", "ESPN connection cancelled.");
        if (webView != null) {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) WebViewCompat.removeWebMessageListener(webView, "SundayDeskEspn");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
