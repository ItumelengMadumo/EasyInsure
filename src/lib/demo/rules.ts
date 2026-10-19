// Pure rules for the demo backend: who may do what. Role lists mirror amplify/data/resource.ts.
// Field definitions, premium and payout maths are imported from the real backend module, so the
// demo cannot drift from production.

export const isSeniorRole = (role: string) => ['senior_officer', 'superuser'].includes(role);
export const isDeveloperRole = (role: string) => role === 'developer';
export const isStaffRole = (role: string) => role !== 'client';
/** Staff who may act on cases: everyone on staff except the read-only developer. */
export const canOperateRole = (role: string) => isStaffRole(role) && !isDeveloperRole(role);

import { calculatePremium, calculateRecommendedPayout, categoryDefinitions, validateApplication } from '../../../amplify/functions/claims-command/underwriting';

export const assetCategoryDefinitions = () => categoryDefinitions;
export const estimatePremium = calculatePremium;
export const recommendPayout = calculateRecommendedPayout;
export { validateApplication };
