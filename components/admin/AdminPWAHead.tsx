'use client';

import { useEffect } from 'react';

/**
 * Injiziert Admin-PWA Meta-Tags in den <head>, damit die Admin-Seite
 * als eigenständige App auf dem Handy gespeichert werden kann.
 */
export default function AdminPWAHead() {
  useEffect(() => {
    const tags: HTMLElement[] = [];

    // Manifest
    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = '/admin-manifest.json';
    document.head.appendChild(manifest);
    tags.push(manifest);

    // Apple Touch Icon
    const appleIcon = document.createElement('link');
    appleIcon.rel = 'apple-touch-icon';
    appleIcon.setAttribute('sizes', '192x192');
    appleIcon.href = '/admin-icon-192.png';
    document.head.appendChild(appleIcon);
    tags.push(appleIcon);

    // Theme Color (dark)
    const themeColor = document.createElement('meta');
    themeColor.name = 'theme-color';
    themeColor.content = '#0f172a';
    document.head.appendChild(themeColor);
    tags.push(themeColor);

    // Apple Web App fähig
    const capable = document.createElement('meta');
    capable.name = 'apple-mobile-web-app-capable';
    capable.content = 'yes';
    document.head.appendChild(capable);
    tags.push(capable);

    // Apple Status Bar Style
    const statusBar = document.createElement('meta');
    statusBar.name = 'apple-mobile-web-app-status-bar-style';
    statusBar.content = 'black-translucent';
    document.head.appendChild(statusBar);
    tags.push(statusBar);

    // Apple App Title
    const appTitle = document.createElement('meta');
    appTitle.name = 'apple-mobile-web-app-title';
    appTitle.content = 'C2R Admin';
    document.head.appendChild(appTitle);
    tags.push(appTitle);

    // Entferne doppelte Manifest-Links (vom Root-Layout)
    const manifests = document.head.querySelectorAll('link[rel="manifest"]');
    if (manifests.length > 1) {
      manifests.forEach((el, i) => {
        if (i < manifests.length - 1) el.remove();
      });
    }

    return () => {
      tags.forEach(tag => tag.remove());
    };
  }, []);

  return null;
}
