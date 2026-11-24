import { describe, expect, it } from 'vitest';
import { formatBalance, formatCompact, parseAmount, truncateAddress } from './format.js';

describe('format', () => {
  it('round-trips a typed amount', () => {
    expect(formatBalance(parseAmount('1.5'))).toBe('1.50 PAS');
  });

  it('rejects malformed amounts', () => {
    expect(parseAmount('1.2.3')).toBeNull();
    expect(parseAmount('-1')).toBeNull();
    expect(parseAmount('0.12345678901')).toBeNull();
  });

  it('abbreviates large counts', () => {
    expect(formatCompact(3_400_000)).toBe('3.4M');
    expect(formatCompact(12)).toBe('12');
  });

  it('leaves short addresses whole', () => {
    expect(truncateAddress('0x1234')).toBe('0x1234');
  });
});
