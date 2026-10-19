import { describe, expect, it } from 'vitest';
import { MAX_VIDEO_BYTES, maxBytesFor, matchesFileSignature, resolveMediaType } from './functions/claims-command/domain';
import { calculateRecommendedPayout, explainPayout } from './functions/claims-command/underwriting';

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new Uint8Array([...text].map((char) => char.charCodeAt(0)));

describe('explainPayout', () => {
  const cases = [
    { coveredLossValue: 98000, policyLimit: 520000, excess: 5000, depreciation: 0.1 },
    { coveredLossValue: 98000, repairEstimate: 92000, replacementEstimate: 120000, policyLimit: 520000, excess: 5000, depreciation: 0.1 },
    { coveredLossValue: 600000, policyLimit: 150000, excess: 7500, depreciation: 0.25 },
    { coveredLossValue: 3000, policyLimit: 50000, excess: 5000, depreciation: 0 },
  ];

  it('always agrees with calculateRecommendedPayout', () => {
    cases.forEach((input) => expect(explainPayout(input).result).toBeCloseTo(calculateRecommendedPayout(input), 6));
  });

  it('shows the cap only when the policy limit bites and never goes below zero', () => {
    expect(explainPayout(cases[0]).capped).toBe(false);
    expect(explainPayout(cases[2]).capped).toBe(true);
    expect(explainPayout(cases[3]).result).toBe(0);
  });

  it('uses the lowest evidenced figure and says which one', () => {
    const [start] = explainPayout(cases[1]).steps;
    expect(start.amount).toBe(92000);
    expect(start.note).toMatch(/repair estimate/);
  });

  it('has steps that add up to the result', () => {
    const { steps, result } = explainPayout(cases[2]);
    expect(steps.filter((step) => step.kind !== 'result').reduce((sum, step) => sum + step.amount, 0)).toBeCloseTo(result, 6);
  });
});

describe('evidence media rules', () => {
  it('recognises HEIC, MP4 and MOV by signature and rejects impostors', () => {
    const heic = [...bytes(0, 0, 0, 24), ...ascii('ftypheic')];
    const mp4 = [...bytes(0, 0, 0, 32), ...ascii('ftypisom')];
    expect(matchesFileSignature(new Uint8Array(heic), 'image/heic')).toBe(true);
    expect(matchesFileSignature(new Uint8Array(mp4), 'video/mp4')).toBe(true);
    expect(matchesFileSignature(new Uint8Array(mp4), 'video/quicktime')).toBe(true);
    expect(matchesFileSignature(new Uint8Array(mp4), 'image/heic')).toBe(false);
    expect(matchesFileSignature(ascii('MZ not a video file'), 'video/mp4')).toBe(false);
  });

  it('gives videos a larger cap than documents', () => {
    expect(maxBytesFor('video/mp4')).toBe(MAX_VIDEO_BYTES);
    expect(maxBytesFor('application/pdf')).toBeLessThan(MAX_VIDEO_BYTES);
  });

  it('falls back to the file extension when the browser reports no type', () => {
    expect(resolveMediaType('IMG_0042.HEIC', '')).toBe('image/heic');
    expect(resolveMediaType('clip.mov', '')).toBe('video/quicktime');
    expect(resolveMediaType('photo.png', 'image/png')).toBe('image/png');
  });
});
