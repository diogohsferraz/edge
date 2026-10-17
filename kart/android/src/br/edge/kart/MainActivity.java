package br.edge.kart;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

/**
 * Abre o jogo (HTML + WebGL) em tela cheia e repassa controle, controle remoto
 * e teclado para o JavaScript, que distingue os jogadores pelo id do dispositivo.
 */
public class MainActivity extends Activity {
    private WebView web;
    // Último dispositivo usado: o botão Voltar do sistema é atribuído a ele.
    private int lastDevice = 0;
    private boolean lastPad = false;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        web.setBackgroundColor(0xFF0B0E1A);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "AndroidApp");
        web.setFocusable(false);
        setContentView(web);
        web.loadUrl("file:///android_asset/web/index.html");
        hideSystemUi();
        // Android 13+: o Voltar chega por este callback (gesto ou tecla), e não como tecla.
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT, new OnBackInvokedCallback() {
                    @Override
                    public void onBackInvoked() {
                        String args = lastDevice + "," + KeyEvent.KEYCODE_BACK + ",";
                        js("window.NativeInput&&(NativeInput.key(" + args + "true," + lastPad + ",false),NativeInput.key("
                            + args + "false," + lastPad + ",false))");
                    }
                });
        }
    }

    private class Bridge {
        @JavascriptInterface
        public void exit() {
            runOnUiThread(new Runnable() {
                public void run() { finish(); }
            });
        }
    }

    private void js(String code) {
        if (web != null) web.evaluateJavascript(code, null);
    }

    private static boolean isPad(InputDevice dev, int source) {
        if ((source & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD) return true;
        if ((source & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK) return true;
        if (dev != null) {
            int ds = dev.getSources();
            return (ds & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (ds & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
        }
        return false;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int code = e.getKeyCode();
        if (code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN
            || code == KeyEvent.KEYCODE_VOLUME_MUTE || code == KeyEvent.KEYCODE_HOME
            || code == KeyEvent.KEYCODE_POWER) {
            return super.dispatchKeyEvent(e);
        }
        int action = e.getAction();
        if (action != KeyEvent.ACTION_DOWN && action != KeyEvent.ACTION_UP) return true;
        boolean pad = isPad(e.getDevice(), e.getSource());
        lastDevice = e.getDeviceId();
        lastPad = pad;
        js("window.NativeInput&&NativeInput.key(" + e.getDeviceId() + "," + code + ","
            + (action == KeyEvent.ACTION_DOWN) + "," + pad + "," + (e.getRepeatCount() > 0) + ")");
        return true;
    }

    private static float axis(MotionEvent e, int a) {
        return e.getAxisValue(a);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent e) {
        int src = e.getSource();
        if ((src & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK
            && e.getAction() == MotionEvent.ACTION_MOVE) {
            float lt = Math.max(axis(e, MotionEvent.AXIS_LTRIGGER), axis(e, MotionEvent.AXIS_BRAKE));
            float rt = Math.max(axis(e, MotionEvent.AXIS_RTRIGGER), axis(e, MotionEvent.AXIS_GAS));
            js("window.NativeInput&&NativeInput.axis(" + e.getDeviceId() + ","
                + axis(e, MotionEvent.AXIS_X) + "," + axis(e, MotionEvent.AXIS_Y) + ","
                + axis(e, MotionEvent.AXIS_HAT_X) + "," + axis(e, MotionEvent.AXIS_HAT_Y) + ","
                + lt + "," + rt + ")");
            return true;
        }
        return super.dispatchGenericMotionEvent(e);
    }

    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onPause() {
        js("window.__onAppPause&&__onAppPause()");
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        hideSystemUi();
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
