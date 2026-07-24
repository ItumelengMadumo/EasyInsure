export const ASSET_SCHEMA_VERSION = '2026-01';
export const PREMIUM_FORMULA_VERSION = 'premium-2026-01';

export type FieldDefinition = {
  key: string; label: string; section: string; type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  required?: boolean; options?: string[];
};

const common: FieldDefinition[] = [
  { key: 'description', label: 'Asset description', section: 'identity', type: 'text', required: true },
  { key: 'ownershipType', label: 'Ownership', section: 'ownership', type: 'select', required: true, options: ['Owned outright', 'Financed', 'Leased'] },
  { key: 'financeProvider', label: 'Finance or lease provider', section: 'ownership', type: 'text' },
  { key: 'purchasePrice', label: 'Purchase or replacement value (ZAR)', section: 'valuation', type: 'number', required: true },
  { key: 'purchaseDate', label: 'Purchase date', section: 'valuation', type: 'date', required: true },
  { key: 'purchaseSource', label: 'Purchase source', section: 'valuation', type: 'text', required: true },
  { key: 'condition', label: 'Current condition', section: 'condition', type: 'select', required: true, options: ['excellent', 'average', 'poor'] },
  { key: 'knownDefects', label: 'Known defects or prior damage', section: 'condition', type: 'text', required: true },
  { key: 'maintenanceHistory', label: 'Maintenance and service history', section: 'condition', type: 'text', required: true },
  { key: 'assetUse', label: 'Primary use', section: 'usage', type: 'select', required: true, options: ['Personal', 'Business', 'Mixed personal and business', 'Rental or leased use'] },
  { key: 'storageLocation', label: 'Usual storage or risk address', section: 'security', type: 'text', required: true },
  { key: 'securityFeatures', label: 'Security and loss-prevention measures', section: 'security', type: 'text', required: true },
  { key: 'priorClaims', label: 'Claims or losses in the past 5 years', section: 'risk', type: 'number', required: true },
  { key: 'cancelledCover', label: 'Cover cancelled, declined or specially rated?', section: 'risk', type: 'boolean', required: true },
  { key: 'relevantConvictions', label: 'Relevant convictions or offences', section: 'risk', type: 'text', required: true },
  { key: 'occupation', label: 'Occupation or business activity', section: 'risk', type: 'text', required: true },
  { key: 'existingInsurance', label: 'Existing insurance details', section: 'risk', type: 'text', required: true },
  { key: 'affordabilityBand', label: 'Preferred affordable monthly range', section: 'risk', type: 'select', required: true, options: ['Under R500', 'R500–R1,500', 'R1,500–R3,000', 'Above R3,000'] },
  { key: 'consentGiven', label: 'I consent to these declarations being used for underwriting', section: 'risk', type: 'boolean', required: true },
];

const specific: Record<string, FieldDefinition[]> = {
  vehicle: [
    { key: 'make', label: 'Make', section: 'identity', type: 'text', required: true }, { key: 'model', label: 'Model and derivative', section: 'identity', type: 'text', required: true },
    { key: 'year', label: 'Model year', section: 'identity', type: 'number', required: true }, { key: 'vin', label: 'VIN', section: 'identity', type: 'text', required: true },
    { key: 'registrationNumber', label: 'Registration number', section: 'identity', type: 'text', required: true }, { key: 'mileageKm', label: 'Mileage (km)', section: 'specifications', type: 'number', required: true },
    { key: 'bodyType', label: 'Body type', section: 'specifications', type: 'text', required: true }, { key: 'engine', label: 'Engine size / fuel / powertrain', section: 'specifications', type: 'text', required: true },
    { key: 'modifications', label: 'Modifications and accessories', section: 'specifications', type: 'text', required: true }, { key: 'drivers', label: 'Regular drivers, ages and licence history', section: 'usage', type: 'text', required: true },
    { key: 'annualMileage', label: 'Expected annual mileage', section: 'usage', type: 'number', required: true }, { key: 'tracking', label: 'Tracker / immobiliser details', section: 'security', type: 'text', required: true },
  ],
  property: [
    { key: 'address', label: 'Insured address', section: 'identity', type: 'text', required: true }, { key: 'propertyType', label: 'Property type', section: 'specifications', type: 'text', required: true },
    { key: 'squareFootage', label: 'Floor area (m²)', section: 'specifications', type: 'number', required: true }, { key: 'constructionType', label: 'Wall / construction type', section: 'specifications', type: 'text', required: true },
    { key: 'roofType', label: 'Roof type', section: 'specifications', type: 'text', required: true }, { key: 'occupancyType', label: 'Occupancy', section: 'usage', type: 'text', required: true },
    { key: 'yearBuilt', label: 'Year built', section: 'specifications', type: 'number', required: true }, { key: 'utilities', label: 'Electrical, plumbing, solar and gas details', section: 'specifications', type: 'text', required: true },
    { key: 'hazards', label: 'Flood, fire, subsidence and environmental exposures', section: 'risk', type: 'text', required: true },
  ],
  electronics: [
    { key: 'make', label: 'Brand / manufacturer', section: 'identity', type: 'text', required: true }, { key: 'model', label: 'Model', section: 'identity', type: 'text', required: true },
    { key: 'serialNumber', label: 'Serial number / IMEI', section: 'identity', type: 'text', required: true }, { key: 'specification', label: 'Technical specification and accessories', section: 'specifications', type: 'text', required: true },
    { key: 'portable', label: 'Regularly used away from the insured address?', section: 'usage', type: 'boolean', required: true }, { key: 'dataProtection', label: 'Tracking, backups and account locks', section: 'security', type: 'text', required: true },
  ],
  furniture: [
    { key: 'make', label: 'Maker / brand / designer', section: 'identity', type: 'text', required: true }, { key: 'model', label: 'Collection / item type', section: 'identity', type: 'text', required: true },
    { key: 'materials', label: 'Materials, dimensions and construction', section: 'specifications', type: 'text', required: true }, { key: 'provenance', label: 'Provenance, appraisal or authenticity', section: 'valuation', type: 'text', required: true },
    { key: 'restoration', label: 'Restoration, alterations and condition notes', section: 'condition', type: 'text', required: true },
  ],
  machinery: [
    { key: 'make', label: 'Manufacturer', section: 'identity', type: 'text', required: true }, { key: 'model', label: 'Model', section: 'identity', type: 'text', required: true },
    { key: 'serialNumber', label: 'Serial / plant number', section: 'identity', type: 'text', required: true }, { key: 'year', label: 'Manufacture year', section: 'identity', type: 'number', required: true },
    { key: 'specification', label: 'Capacity, power and technical specification', section: 'specifications', type: 'text', required: true }, { key: 'hours', label: 'Operating hours', section: 'usage', type: 'number', required: true },
    { key: 'operators', label: 'Operators, training and certification', section: 'usage', type: 'text', required: true }, { key: 'commercialExposure', label: 'Operating environment and commercial exposure', section: 'risk', type: 'text', required: true },
    { key: 'replacementAvailability', label: 'Parts and replacement availability', section: 'valuation', type: 'text', required: true },
  ],
};

export const categoryDefinitions = Object.fromEntries(Object.keys(specific).map((assetType) => [
  assetType, { assetType, schemaVersion: ASSET_SCHEMA_VERSION, fields: [...common, ...specific[assetType]] },
]));

export function validateApplication(assetType: string, answers: Record<string, unknown>) {
  const definition = categoryDefinitions[assetType];
  if (!definition) return ['Unsupported asset category'];
  return definition.fields.filter((field) => field.required && (
    answers[field.key] === undefined || answers[field.key] === null || answers[field.key] === '' ||
    (field.type === 'boolean' && field.key === 'consentGiven' && answers[field.key] !== true)
  )).map((field) => field.label);
}

export function calculatePremium(assetType: string, answers: Record<string, unknown>) {
  const bases: Record<string, number> = { vehicle: 500, property: 800, electronics: 200, furniture: 240, machinery: 700 };
  const value = Math.max(0, Number(answers.purchasePrice) || 0);
  const claims = Math.max(0, Number(answers.priorClaims) || 0);
  const factors = [
    { name: 'Asset value', factor: Math.min(value / 1_000_000, 1.2), reason: `Declared value R${value.toFixed(2)}` },
    { name: 'Claims history', factor: claims * 0.12, reason: `${claims} declared prior losses` },
    { name: 'Condition', factor: answers.condition === 'poor' ? 0.2 : answers.condition === 'excellent' ? -0.05 : 0, reason: `Condition: ${answers.condition}` },
    { name: 'Commercial use', factor: String(answers.assetUse).toLowerCase().includes('business') ? 0.15 : 0, reason: `Use: ${answers.assetUse}` },
    { name: 'Cover history', factor: answers.cancelledCover === true ? 0.2 : 0, reason: answers.cancelledCover ? 'Prior cover event declared' : 'No prior cover event declared' },
  ];
  const riskScore = factors.reduce((sum, item) => sum + item.factor, 0);
  const indicativePremium = Math.max(bases[assetType] * (1 + riskScore), bases[assetType] * 0.5);
  return {
    riskScore, indicativePremium: Math.round(indicativePremium * 100) / 100,
    rangeLow: Math.round(indicativePremium * 0.85 * 100) / 100,
    rangeHigh: Math.round(indicativePremium * 1.2 * 100) / 100, factors,
    assumptions: ['Indicative only; not active cover', 'Subject to evidence verification and human underwriting', 'External data checks are not active'],
  };
}

export function calculateRecommendedPayout(input: { coveredLossValue: number; repairEstimate?: number; replacementEstimate?: number; policyLimit: number; excess: number; depreciation: number }) {
  const candidates = [input.coveredLossValue, input.repairEstimate, input.replacementEstimate].filter((value): value is number => Number.isFinite(value) && value! >= 0);
  const evidencedLoss = Math.min(...candidates);
  return Math.max(0, Math.min(evidencedLoss * (1 - input.depreciation), input.policyLimit) - input.excess);
}
