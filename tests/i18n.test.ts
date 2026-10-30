import { describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';
import am from '../src/i18n/am.json';
import { pickLang, t } from '../src/lib/i18n';

describe('i18n', () => {
  it('English and Amharic files have identical keys', () => {
    expect(Object.keys(am).sort()).toEqual(Object.keys(en).sort());
  });
  it('picks language', () => {
    expect(pickLang('am-ET,en;q=0.8')).toBe('am');
    expect(pickLang('en-US')).toBe('en');
    expect(pickLang('en-US', 'am')).toBe('am');
  });
  it('interpolates params', () => {
    expect(t('en', 'invoice.shareText', { number: 'INV-1', business: 'Shop' })).toBe('Invoice INV-1 from Shop');
  });
});
