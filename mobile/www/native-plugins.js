import { App } from '@capacitor/app';
import { PushNotifications } from '@capacitor/push-notifications';
import { StatusBar, Style } from '@capacitor/status-bar';

window.__PE_CAP = { App, PushNotifications, StatusBar, Style };

// StatusBar is optional — never block app boot.
queueMicrotask(() => {
  StatusBar.setBackgroundColor({ color: '#e8f4f3' }).catch(() => {});
  StatusBar.setStyle({ style: Style.Light }).catch(() => {});
});
