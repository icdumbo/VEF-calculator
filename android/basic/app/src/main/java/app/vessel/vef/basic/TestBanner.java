package app.vessel.vef.basic;

import android.app.Activity;
import android.view.View;
import android.view.MotionEvent;
import android.view.ViewConfiguration;
import android.webkit.WebView;
import android.widget.FrameLayout;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import org.json.JSONObject;

/** One official test banner, positioned in a reserved DOM slot, not over content. */
final class TestBanner {
    private final Activity activity;
    private final WebView web;
    private final FrameLayout host;
    private final FrameLayout root;
    private AdView ad;
    private int requestedWidth;
    private boolean initialized, destroyed, loaded;
    private float scale = 1;

    TestBanner(Activity activity, WebView web, FrameLayout root) {
        this.activity = activity;
        this.web = web;
        this.root = root;
        host = new FrameLayout(activity) {
            private MotionEvent down;
            private boolean scrolling;
            private final int slop = ViewConfiguration.get(activity).getScaledTouchSlop();
            private void forward(MotionEvent event) {
                MotionEvent copy = MotionEvent.obtain(event);
                int[] here = new int[2], there = new int[2];
                getLocationInWindow(here); web.getLocationInWindow(there);
                copy.offsetLocation(here[0] - there[0], here[1] - there[1]);
                web.dispatchTouchEvent(copy); copy.recycle();
            }
            @Override public boolean dispatchTouchEvent(MotionEvent event) {
                if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
                    if (down != null) down.recycle();
                    down = MotionEvent.obtain(event); scrolling = false;
                }
                if (!scrolling && down != null && event.getActionMasked() == MotionEvent.ACTION_MOVE
                    && Math.abs(event.getY() - down.getY()) > slop) {
                    MotionEvent cancel = MotionEvent.obtain(event);
                    cancel.setAction(MotionEvent.ACTION_CANCEL); super.dispatchTouchEvent(cancel); cancel.recycle();
                    scrolling = true; forward(down);
                }
                boolean handled;
                if (scrolling) { forward(event); handled = true; }
                else handled = super.dispatchTouchEvent(event);
                if (event.getActionMasked() == MotionEvent.ACTION_UP || event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
                    if (down != null) { down.recycle(); down = null; }
                    scrolling = false;
                }
                return handled;
            }
        };
        host.setClipChildren(true);
        host.setVisibility(View.GONE);
        root.addView(host, new FrameLayout.LayoutParams(1, 1));
        new Thread(() -> MobileAds.initialize(activity, status -> activity.runOnUiThread(() -> {
            if (destroyed) return;
            initialized = true;
            web.evaluateJavascript("window.dispatchEvent(new Event('resize'))", null);
        }))).start();
    }

    void layout(String message) {
        if (destroyed) return;
        try {
            JSONObject r = new JSONObject(message);
            double viewport = r.getDouble("viewport");
            if (!Double.isFinite(viewport) || viewport <= 0 || web.getWidth() <= 0) return;
            scale = (float) (web.getWidth() / viewport);
            int width = (int) Math.floor(r.getDouble("width") * scale);
            if (width < 100 || width > web.getWidth()) return;
            int dp = (int) (width / activity.getResources().getDisplayMetrics().density);
            if (initialized && requestedWidth != dp) request(dp);
            int top = (int) Math.round(r.getDouble("y") * scale);
            int height = (int) Math.round(r.getDouble("height") * scale);
            int bottom = Math.min(web.getHeight(), (int) Math.round(r.getDouble("bottom") * scale));
            int visibleTop = Math.max(0, top), visibleBottom = Math.min(bottom, top + height);
            if (!loaded || !r.getBoolean("visible") || visibleBottom <= visibleTop || height <= 0) {
                host.setVisibility(View.GONE); return;
            }
            FrameLayout.LayoutParams position = new FrameLayout.LayoutParams(width, visibleBottom - visibleTop);
            position.leftMargin = web.getLeft() - root.getPaddingLeft() + (int) Math.round(r.getDouble("x") * scale);
            position.topMargin = web.getTop() - root.getPaddingTop() + visibleTop;
            host.setLayoutParams(position);
            ad.setTranslationY(top - visibleTop);
            host.setVisibility(View.VISIBLE);
        } catch (Exception ignored) { host.setVisibility(View.GONE); }
    }

    private void request(int width) {
        requestedWidth = width; loaded = false;
        host.setVisibility(View.GONE);
        web.evaluateJavascript("window.vefAdHeight(0)", null);
        if (ad != null) { host.removeView(ad); ad.destroy(); }
        AdView current = new AdView(activity);
        ad = current;
        // Official Google adaptive banner test ID only. No real account ID.
        current.setAdUnitId("ca-app-pub-3940256099942544/9214589741");
        AdSize size = AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(activity, width);
        current.setAdSize(size);
        host.addView(current, new FrameLayout.LayoutParams(size.getWidthInPixels(activity), size.getHeightInPixels(activity)));
        current.setAdListener(new AdListener() {
            @Override public void onAdLoaded() {
                if (destroyed || ad != current) return;
                loaded = true;
                web.evaluateJavascript("window.vefAdHeight(" + (size.getHeightInPixels(activity) / scale) + ")", null);
            }
            @Override public void onAdFailedToLoad(LoadAdError error) {
                if (destroyed || ad != current) return;
                loaded = false; host.setVisibility(View.GONE);
                web.evaluateJavascript("window.vefAdHeight(0)", null);
            }
        });
        current.loadAd(new AdRequest.Builder().build());
    }
    void pause() { if (ad != null) ad.pause(); }
    void resume() { if (ad != null) ad.resume(); }
    void destroy() { destroyed = true; host.setVisibility(View.GONE); if (ad != null) ad.destroy(); }
}
