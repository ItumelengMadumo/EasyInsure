import { describe, expect, it } from 'vitest';
import { categoryDefinitions } from '../../amplify/functions/claims-command/underwriting';
import { FIELD_GUIDANCE, OPTION_LABELS, SECTION_INTRO } from './fieldGuidance';

describe('underwriting field guidance', () => {
  it('explains every question the backend can ask', () => {
    const missing = Object.values(categoryDefinitions).flatMap((definition) =>
      definition.fields.filter((field) => !FIELD_GUIDANCE[field.key]?.hint && !FIELD_GUIDANCE[field.key]?.placeholder)
        .map((field) => `${definition.assetType}.${field.key}`));
    expect(missing).toEqual([]);
  });

  it('describes every wizard section and every condition option', () => {
    const sections = new Set(Object.values(categoryDefinitions).flatMap((d) => d.fields.map((f) => f.section)));
    sections.forEach((section) => expect(SECTION_INTRO[section]).toBeTruthy());
    ['excellent', 'average', 'poor'].forEach((value) => expect(OPTION_LABELS.condition[value]).toBeTruthy());
  });
});
