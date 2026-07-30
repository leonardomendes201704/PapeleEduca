/** Lazy accessors for plugins registered by native-plugins.bundle.js */

export function getApp() {
  return window.__PE_CAP?.App || null;
}

export function getPushNotifications() {
  return window.__PE_CAP?.PushNotifications || null;
}

export function getStatusBar() {
  return window.__PE_CAP?.StatusBar || null;
}
