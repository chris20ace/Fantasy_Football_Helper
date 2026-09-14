package dev.acebuilds.sundaydesk;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.ConsoleMessage;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Own process/profile, no native JavaScript bridge, no password reads or injected script. */
public final class EspnSignInActivity extends Activity {
    private static boolean directoryConfigured;
    private WebView webView;
    private TextView status;
    private Button continueButton;
    private String requestId;
    private boolean closing;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        requestId = getIntent().getStringExtra("requestId");
        if (!UrlPolicy.isRequestId(requestId)) { finish(); return; }
        setResult(RESULT_CANCELED, new Intent().putExtra("requestId", requestId));
        if (!directoryConfigured) {
            WebView.setDataDirectorySuffix("espn-signin");
            directoryConfigured = true;
        }
        WebView.setWebContentsDebuggingEnabled(false);
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setBackgroundColor(0xfff5f7fb);
        container.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        TextView heading = new TextView(this);
        heading.setText("Connect ESPN"); heading.setTextSize(21); heading.setPadding(dp(16), dp(14), dp(16), dp(4));
        container.addView(heading);
        status = new TextView(this);
        status.setText("Sign in directly with ESPN, then tap Continue. Sunday Desk receives your ESPN session, never your password.");
        status.setTextSize(14); status.setPadding(dp(16), 0, dp(16), dp(12));
        container.addView(status);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        // Normal target=_blank links stay in this provider WebView. No popup receives our bridge.
        settings.setSupportMultipleWindows(false);
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) { return true; }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) {
                    // ESPN owns its page and embedded identity/challenge frames; none has our bridge.
                    return !"https".equals(request.getUrl().getScheme()) && !"about:blank".equals(request.getUrl().toString());
                }
                if (UrlPolicy.isProvider(request.getUrl().toString())) return false;
                if (request.isForMainFrame()) status.setText("That link is outside ESPN sign-in. Stay here to finish connecting.");
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                if (!UrlPolicy.isProvider(url)) view.stopLoading();
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) status.setText("ESPN could not load. Check your connection, or cancel and try again.");
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                finishWith(null);
                return true;
            }
        });
        container.addView(webView, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.END); actions.setPadding(dp(12), dp(8), dp(12), dp(8));
        Button cancel = new Button(this); cancel.setText("Cancel"); cancel.setMinHeight(dp(48));
        cancel.setOnClickListener(view -> finishWith(null)); actions.addView(cancel);
        continueButton = new Button(this); continueButton.setText("Continue"); continueButton.setMinHeight(dp(48));
        continueButton.setEnabled(false); continueButton.setOnClickListener(view -> complete()); actions.addView(continueButton);
        container.addView(actions);
        setContentView(container);
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true); // Disney account sign-in runs inside ESPN.
        cookies.removeAllCookies(ignored -> {
            if (closing || webView == null || isDestroyed()) return;
            WebStorage.getInstance().deleteAllData();
            webView.clearCache(true);
            continueButton.setEnabled(true);
            webView.loadUrl(UrlPolicy.ESPN_URL);
        });
    }

    private void complete() {
        if (closing || !UrlPolicy.isProvider(webView.getUrl())) return;
        // Called only by the native Continue button. No background session probing.
        String cookies = CookieManager.getInstance().getCookie("https://fantasy.espn.com/");
        String s2 = EspnSession.cookie(cookies, "espn_s2");
        String swid = EspnSession.cookie(cookies, "SWID");
        if (!EspnSession.isValid(s2, swid)) {
            status.setText("Finish signing in to ESPN first, then tap Continue. If you see a sign-in button, use it above.");
            return;
        }
        Intent result = new Intent();
        result.putExtra("requestId", requestId).putExtra("s2", s2).putExtra("swid", swid);
        finishWith(result);
    }

    private void finishWith(Intent result) {
        if (closing) return;
        closing = true;
        if (continueButton != null) continueButton.setEnabled(false);
        if (webView != null) {
            webView.stopLoading(); webView.clearCache(true); webView.clearHistory();
            WebStorage.getInstance().deleteAllData();
        }
        CookieManager.getInstance().removeAllCookies(ignored -> {
            CookieManager.getInstance().flush();
            if (result == null) setResult(RESULT_CANCELED, new Intent().putExtra("requestId", requestId));
            else setResult(RESULT_OK, result);
            finish();
        });
    }

    @Override public void onBackPressed() { finishWith(null); }

    @Override protected void onDestroy() {
        closing = true;
        if (webView != null) {
            webView.stopLoading(); webView.destroy(); webView = null;
            CookieManager.getInstance().removeAllCookies(null);
            WebStorage.getInstance().deleteAllData();
        }
        super.onDestroy();
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
