// Native Keel code consent (public/js/content.js): per content set, remembered in this browser, independent of the
// server's owner gate and of other seats. The room screen's NativeConsentBar and content.js's simContent use these.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasNativeConsent, rememberNativeConsent, acceptNativeConsent, declineNativeConsent } from '../../public/js/content.js';

const cs = (c) => c.repeat(64);
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    map: m,
  };
};

test('native consent is per content set and stored', () => {
  const s = storage();
  assert.equal(hasNativeConsent(cs('a'), s), false);
  rememberNativeConsent(cs('a'), true, s);
  assert.equal(hasNativeConsent(cs('a'), s), true);
  assert.equal(s.getItem('sp.plugin.native.' + cs('a')), 'yes');
  assert.equal(hasNativeConsent(cs('b'), s), false, 'another set is not covered');
  rememberNativeConsent(cs('a'), false, s);
  assert.equal(hasNativeConsent(cs('a'), s), false);
  assert.equal(s.getItem('sp.plugin.native.' + cs('a')), null);
});

test('native consent survives storage that throws, and the accept/decline entry points do not require a held set', () => {
  const broken = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
  };
  assert.equal(hasNativeConsent(cs('c'), broken), false);
  acceptNativeConsent(cs('c'));
  assert.equal(hasNativeConsent(cs('c'), broken), true, 'the page memory keeps the answer');
  declineNativeConsent(cs('c'));
  assert.equal(hasNativeConsent(cs('c'), broken), false);
});
