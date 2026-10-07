package app.vessel.vef.basic;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputConnectionWrapper;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Collections;
import java.util.Map;
import java.util.HashMap;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "appassets.androidplatform.net";
    private static final String START = "https://" + ORIGIN + "/assets/index.html";
    private static final Map<String, String> ASSETS = new HashMap<>();
    static {
        ASSETS.put("index.html", "text/html");
        ASSETS.put("styles.css", "text/css");
        ASSETS.put("app.js", "application/javascript");
        ASSETS.put("form-inputs.js", "application/javascript");
        ASSETS.put("calculation.js", "application/javascript");
        ASSETS.put("logo.png", "image/png");
    }
    private WebView webView;
    private boolean exitDialogOpen;

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(240, 244, 246));
        webView = new WebView(this) {
            @Override public InputConnection onCreateInputConnection(EditorInfo info) {
                InputConnection connection = super.onCreateInputConnection(info);
                if (connection == null) return null;
                if (info.inputType != InputType.TYPE_NULL) {
                    info.imeOptions = (info.imeOptions & ~EditorInfo.IME_MASK_ACTION
                        & ~EditorInfo.IME_FLAG_NO_ENTER_ACTION) | EditorInfo.IME_ACTION_NEXT;
                }
                return new InputConnectionWrapper(connection, false) {
                    @Override public boolean performEditorAction(int action) {
                        if (action == EditorInfo.IME_ACTION_NEXT) {
                            post(() -> evaluateJavascript(
                                "typeof window.vefNextField==='function'&&window.vefNextField()", null));
                            return true;
                        }
                        return super.performEditorAction(action);
                    }
                };
            }
        };
        webView.setSaveEnabled(false);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets safe = insets.getInsets(WindowInsets.Type.systemBars()
                    | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return WindowInsets.CONSUMED;
            });
            root.requestApplyInsets();
        } else {
            root.setFitsSystemWindows(true);
        }
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setDatabaseEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setGeolocationEnabled(false);
        settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        WebView.setWebContentsDebuggingEnabled(false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !START.equals(request.getUrl().toString());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String name = uri.getPath() == null ? "" : uri.getPath().replaceFirst("^/assets/", "");
                if ("GET".equals(request.getMethod()) && "https".equals(uri.getScheme())
                    && ORIGIN.equals(uri.getHost()) && uri.getPort() == -1
                    && ("/assets/" + name).equals(uri.getPath()) && ASSETS.containsKey(name)) {
                    try {
                        return new WebResourceResponse(ASSETS.get(name), name.endsWith(".png") ? null : "UTF-8",
                            200, "OK", Collections.singletonMap("Cache-Control", "no-store"), getAssets().open(name));
                    } catch (IOException ignored) { }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                    Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
        });
        webView.loadUrl(START);
    }

    @Override public void onBackPressed() {
        if (exitDialogOpen) return;
        webView.evaluateJavascript("(function(){const d=document.getElementById('confirmDialog');"
            + "if(d&&d.open){document.getElementById('cancelReset').click();return 'dialog';}"
            + "return typeof hasData==='function'&&hasData()?'dirty':'empty';})()", result -> {
                if (isFinishing() || isDestroyed() || "\"dialog\"".equals(result)) return;
                if ("\"empty\"".equals(result)) { finish(); return; }
                exitDialogOpen = true;
                AlertDialog dialog = new AlertDialog.Builder(this)
                    .setTitle("Close calculator?")
                    .setMessage("Entered data is not saved and will be cleared when you close the calculator.")
                    .setNegativeButton("Keep editing", null)
                    .setPositiveButton("Close", (d, which) -> finish()).create();
                dialog.setOnDismissListener(d -> exitDialogOpen = false);
                dialog.show();
            });
    }

    @Override protected void onPause() { webView.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (webView != null) webView.onResume(); }
    @Override protected void onDestroy() {
        if (webView != null) { ((FrameLayout) webView.getParent()).removeView(webView); webView.destroy(); }
        super.onDestroy();
    }
}
