import { App } from '@capacitor/app';
import { PushNotifications } from '@capacitor/push-notifications';
import { StatusBar, Style } from '@capacitor/status-bar';

window.__PE_CAP = { App, PushNotifications, StatusBar, Style };

// Keep system status bar outside the WebView so content/toasts are not clipped.
queueMicrotask(async () => {
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: '#e8f4f3' });
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.show();
  } catch {
    // browser / unsupported
  }
});
