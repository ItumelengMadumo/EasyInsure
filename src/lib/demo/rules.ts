// Pure rules for the demo backend: who may do what. Role lists mirror amplify/data/resource.ts.
// Field definitions, premium and payout maths are imported from the real backend module, so the
// demo cannot drift from production.

import { roleFlags } from '../roles';

export const isSeniorRole = (role: string) => roleFlags([role]).isSenior;
export const isDeveloperRole = (role: string) => roleFlags([role]).isDeveloper;
export const isStaffRole = (role: string) => roleFlags([role]).isStaff;
/** Staff who may act on cases: everyone on staff except the read-only developer. */
export const canOperateRole = (role: string) => roleFlags([role]).canOperate;

import { calculatePremium, calculateRecommendedPayout, categoryDefinitions, validateApplication } from '../../../amplify/functions/claims-command/underwriting';

export const assetCategoryDefinitions = () => categoryDefinitions;
export const estimatePremium = calculatePremium;
export const recommendPayout = calculateRecommendedPayout;
export { validateApplication };
