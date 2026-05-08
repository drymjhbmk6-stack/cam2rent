import { describe, it, expect } from 'vitest';
import {
  isAllowedImageSourceUrl,
  isAllowedStockUrl,
  isUnsplashUrl,
  isSendcloudUrl,
  isAllowedPushEndpoint,
  isAllowedNotificationLink,
} from '../url-allowlist';

describe('isAllowedImageSourceUrl — SSRF-Schutz', () => {
  it('https Supabase ist erlaubt', () => {
    expect(isAllowedImageSourceUrl('https://abc.supabase.co/storage/v1/x.jpg')).toBe(true);
  });

  it('https cam2rent.de ist erlaubt', () => {
    expect(isAllowedImageSourceUrl('https://cam2rent.de/foo.jpg')).toBe(true);
  });

  it('http (unverschluesselt) wird abgelehnt', () => {
    expect(isAllowedImageSourceUrl('http://images.unsplash.com/x.jpg')).toBe(false);
  });

  it('localhost wird blockiert', () => {
    expect(isAllowedImageSourceUrl('https://localhost/x')).toBe(false);
  });

  it('127.0.0.1 wird blockiert', () => {
    expect(isAllowedImageSourceUrl('https://127.0.0.1/x')).toBe(false);
  });

  it('AWS-Cloud-Metadata 169.254.169.254 wird blockiert', () => {
    expect(isAllowedImageSourceUrl('https://169.254.169.254/latest/meta-data/')).toBe(false);
  });

  it('Google-Cloud-Metadata wird blockiert', () => {
    expect(isAllowedImageSourceUrl('https://metadata.google.internal/')).toBe(false);
  });

  it('RFC1918 10.x.x.x wird blockiert', () => {
    expect(isAllowedImageSourceUrl('https://10.0.0.1/secret')).toBe(false);
  });

  it('RFC1918 192.168.x wird blockiert', () => {
    expect(isAllowedImageSourceUrl('https://192.168.1.1/')).toBe(false);
  });

  it('RFC1918 172.16-31.x wird blockiert', () => {
    expect(isAllowedImageSourceUrl('https://172.20.5.5/')).toBe(false);
    expect(isAllowedImageSourceUrl('https://172.31.99.99/')).toBe(false);
  });

  it('172.15.x ist NICHT RFC1918 (waere erlaubt wenn whitelisted)', () => {
    // 172.15.x ist nicht in 172.16-31, wird also nicht als RFC1918 geblockt.
    // Aber: nicht in Allowlist -> trotzdem false.
    expect(isAllowedImageSourceUrl('https://172.15.5.5/')).toBe(false);
  });

  it('IPv6-Loopback wird blockiert', () => {
    expect(isAllowedImageSourceUrl('https://[::1]/')).toBe(false);
  });

  it('Externe Domain ohne Allowlist-Eintrag wird abgelehnt', () => {
    expect(isAllowedImageSourceUrl('https://attacker.com/x.jpg')).toBe(false);
  });

  it('Ungueltige URL -> false', () => {
    expect(isAllowedImageSourceUrl('not-a-url')).toBe(false);
  });

  it('Leerer String -> false', () => {
    expect(isAllowedImageSourceUrl('')).toBe(false);
  });
});

describe('isAllowedStockUrl', () => {
  it('Pexels-Video erlaubt', () => {
    expect(isAllowedStockUrl('https://videos.pexels.com/v/x.mp4')).toBe(true);
  });

  it('Pixabay erlaubt', () => {
    expect(isAllowedStockUrl('https://cdn.pixabay.com/v/x.mp4')).toBe(true);
  });

  it('Unsplash erlaubt? Nein (gehoert nicht zu Stock)', () => {
    expect(isAllowedStockUrl('https://images.unsplash.com/x.jpg')).toBe(false);
  });

  it('Cloud-Metadata blockiert', () => {
    expect(isAllowedStockUrl('https://169.254.169.254/')).toBe(false);
  });
});

describe('isUnsplashUrl', () => {
  it('images.unsplash.com erlaubt', () => {
    expect(isUnsplashUrl('https://images.unsplash.com/photo-x')).toBe(true);
  });

  it('plus.unsplash.com erlaubt', () => {
    expect(isUnsplashUrl('https://plus.unsplash.com/x')).toBe(true);
  });

  it('api.unsplash.com erlaubt', () => {
    expect(isUnsplashUrl('https://api.unsplash.com/photos/x')).toBe(true);
  });

  it('attacker.com NICHT', () => {
    expect(isUnsplashUrl('https://attacker.com/fakeunsplash')).toBe(false);
  });

  it('http blockiert', () => {
    expect(isUnsplashUrl('http://images.unsplash.com/x')).toBe(false);
  });
});

describe('isSendcloudUrl', () => {
  it('panel.sendcloud.sc erlaubt', () => {
    expect(isSendcloudUrl('https://panel.sendcloud.sc/api/v2/labels/x')).toBe(true);
  });

  it('Subdomain auf .sendcloud.sc erlaubt', () => {
    expect(isSendcloudUrl('https://api.sendcloud.sc/x')).toBe(true);
  });

  it('attacker.com NICHT', () => {
    expect(isSendcloudUrl('https://attacker.com/sendcloud-fake')).toBe(false);
  });

  it('sendcloud.com (anderer TLD) NICHT', () => {
    expect(isSendcloudUrl('https://panel.sendcloud.com/x')).toBe(false);
  });
});

describe('isAllowedPushEndpoint', () => {
  it('FCM Google erlaubt', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/wp/x')).toBe(true);
  });

  it('Mozilla Push erlaubt', () => {
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/x')).toBe(true);
  });

  it('Apple Push (subdomain) erlaubt', () => {
    expect(isAllowedPushEndpoint('https://api.push.apple.com/x')).toBe(true);
  });

  it('Windows Notify erlaubt', () => {
    expect(isAllowedPushEndpoint('https://abc.notify.windows.com/x')).toBe(true);
  });

  it('attacker.com NICHT', () => {
    expect(isAllowedPushEndpoint('https://attacker.com/push')).toBe(false);
  });

  it('FCM Subdomain erlaubt (.googleapis.com)', () => {
    expect(isAllowedPushEndpoint('https://fcm-xy.googleapis.com/x')).toBe(true);
  });
});

describe('isAllowedNotificationLink', () => {
  it('Relative URL beginnend mit / erlaubt', () => {
    expect(isAllowedNotificationLink('/admin/buchungen/123')).toBe(true);
  });

  it('Protocol-relative // wird abgelehnt', () => {
    expect(isAllowedNotificationLink('//attacker.com/foo')).toBe(false);
  });

  it('Absolute https cam2rent.de erlaubt', () => {
    expect(isAllowedNotificationLink('https://cam2rent.de/admin')).toBe(true);
  });

  it('www.cam2rent.de erlaubt', () => {
    expect(isAllowedNotificationLink('https://www.cam2rent.de/foo')).toBe(true);
  });

  it('http (unverschluesselt) abgelehnt', () => {
    expect(isAllowedNotificationLink('http://cam2rent.de/x')).toBe(false);
  });

  it('attacker.com abgelehnt', () => {
    expect(isAllowedNotificationLink('https://attacker.com/cam2rent')).toBe(false);
  });

  it('javascript: abgelehnt (nicht https)', () => {
    expect(isAllowedNotificationLink('javascript:alert(1)')).toBe(false);
  });

  it('null/leer -> false', () => {
    expect(isAllowedNotificationLink('')).toBe(false);
  });
});
