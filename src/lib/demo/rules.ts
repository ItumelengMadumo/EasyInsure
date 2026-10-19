// Pure rules for the demo backend: who may do what, and the simplified pricing and payout
// maths. Role lists mirror amplify/data/resource.ts (staff and senior arrays).

export const isSeniorRole = (role: string) => ['senior_officer', 'superuser'].includes(role);
export const isDeveloperRole = (role: string) => role === 'developer';
export const isStaffRole = (role: string) => role !== 'client';
/** Staff who may act on cases: everyone on staff except the read-only developer. */
export const canOperateRole = (role: string) => isStaffRole(role) && !isDeveloperRole(role);

const RATES: Record<string, number> = { vehicle: 0.024, property: 0.0065, electronics: 0.038, furniture: 0.02, machinery: 0.018 };
const CONDITION: Record<string, number> = { excellent: 0.92, average: 1, poor: 1.2 };

export function estimatePremium(assetType: string, value: number, condition = 'average', priorClaims = 0) {
  const base = value * (RATES[assetType] ?? 0.02) / 12;
  const conditionFactor = CONDITION[condition] ?? 1;
  const historyFactor = 1 + Math.min(priorClaims, 3) * 0.15;
  const premium = Math.max(95, Math.round(base * conditionFactor * historyFactor));
  return {
    indicativePremium: premium, rangeLow: Math.round(premium * 0.9), rangeHigh: Math.round(premium * 1.12),
    riskScore: Math.min(95, Math.round(25 + (conditionFactor - 0.92) * 60 + priorClaims * 12)),
    factors: [
      { name: 'Category rate', factor: RATES[assetType] ?? 0.02, reason: `Annual base rate for ${assetType} cover.` },
      { name: 'Condition', factor: conditionFactor, reason: `Declared condition: ${condition}.` },
      { name: 'Claims history', factor: historyFactor, reason: `${priorClaims} prior claim(s) declared.` },
    ],
    assumptions: ['Declared information is accurate.', 'Demo pricing only: not a real quote.'],
  };
}

/** Covered loss less depreciation, capped at the policy limit, less excess. Never negative. */
export function recommendPayout(input: { coveredLossValue: number; policyLimit: number; excess: number; depreciation: number }) {
  const depreciated = input.coveredLossValue * (1 - Math.min(Math.max(input.depreciation, 0), 1));
  return Math.max(0, Math.round(Math.min(depreciated, input.policyLimit) - input.excess));
}

type Def = { key: string; label: string; section: string; type: string; required?: boolean; options?: string[] };
const f = (section: string, key: string, label: string, type = 'text', required = false, options?: string[]): Def =>
  ({ key, label, section, type, required, ...(options ? { options } : {}) });

const IDENTITY: Record<string, Def[]> = {
  vehicle: [f('identity', 'description', 'Vehicle description', 'text', true), f('identity', 'make', 'Make', 'text', true), f('identity', 'model', 'Model', 'text', true), f('identity', 'year', 'Year', 'number', true), f('identity', 'vin', 'VIN'), f('identity', 'registrationNumber', 'Registration number')],
  property: [f('identity', 'description', 'Property description', 'text', true), f('identity', 'address', 'Street address', 'text', true)],
  electronics: [f('identity', 'description', 'Device description', 'text', true), f('identity', 'make', 'Make', 'text', true), f('identity', 'model', 'Model'), f('identity', 'serialNumber', 'Serial number')],
  furniture: [f('identity', 'description', 'Item description', 'text', true)],
  machinery: [f('identity', 'description', 'Equipment description', 'text', true), f('identity', 'make', 'Make'), f('identity', 'model', 'Model'), f('identity', 'serialNumber', 'Serial number')],
};
const SPECS: Record<string, Def[]> = {
  vehicle: [f('specifications', 'mileageKm', 'Mileage (km)', 'number')],
  property: [f('specifications', 'squareFootage', 'Floor area (m²)', 'number', true), f('specifications', 'constructionType', 'Construction', 'select', false, ['Brick', 'Timber', 'Steel frame']), f('specifications', 'roofType', 'Roof', 'select', false, ['Tile', 'Thatch', 'Metal sheet'])],
  electronics: [f('specifications', 'portable', 'Is it portable?', 'boolean')],
  furniture: [f('specifications', 'yearsInUse', 'Years in use', 'number')],
  machinery: [f('specifications', 'yearsInUse', 'Years in use', 'number')],
};

export function assetCategoryDefinitions() {
  return Object.fromEntries(Object.keys(RATES).map((assetType) => [assetType, {
    assetType, schemaVersion: 'demo-1',
    fields: [
      f('ownership', 'ownerType', 'Who owns it?', 'select', true, ['Individual', 'Company', 'Trust']),
      ...IDENTITY[assetType], ...SPECS[assetType],
      f('condition', 'condition', 'Condition', 'select', true, ['excellent', 'average', 'poor']),
      f('usage', 'assetUse', 'Primary use', 'select', true, ['Personal', 'Business']),
      f('security', 'securityFeatures', 'Security features'),
      f('valuation', 'purchasePrice', 'Replacement value (ZAR)', 'number', true), f('valuation', 'purchaseDate', 'Purchase date', 'date', true),
      f('risk', 'priorClaims', 'Claims in the last 3 years', 'number'), f('risk', 'priorLosses', 'Any previous loss of this asset?', 'boolean'),
    ],
  }]));
}

