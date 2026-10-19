// The single definition of what each Cognito group may do in the UI. The backend re-checks every
// action (amplify/functions/claims-command/handler.ts); this only decides what is shown.
export type Access = {
  isClient: boolean;
  isStaff: boolean;
  isSenior: boolean;
  isSuperuser: boolean;
  isDeveloper: boolean;
  /** Staff who may act on cases: everyone on staff except the read-only developer. */
  canOperate: boolean;
};

export function roleFlags(groups: readonly string[] = []): Access {
  const has = (...names: string[]) => groups.some((group) => names.includes(group));
  const isStaff = groups.some((group) => group.endsWith('_officer') || ['developer', 'superuser'].includes(group));
  const isDeveloper = has('developer');
  return {
    isClient: !isStaff,
    isStaff,
    isSenior: has('senior_officer', 'superuser'),
    isSuperuser: has('superuser'),
    isDeveloper,
    canOperate: isStaff && !isDeveloper,
  };
}
