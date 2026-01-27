import { runDecisionEngine } from '../decisionEngine.js';

const getScore = (res) => res?.priority_score ?? res?.score;


function basePayload(overrides = {}) {
  return {
    pathway: 'oncogenetics',
    patient_age: 45,
    patient_sex: 'female',
    chief_concern: 'Family history concern',
    clinical_notes: '',
    family_history_summary: 'Mother had breast cancer.',
    confirmed_flags: [], // Step 2 by default (score computed)
    ...overrides,
  };
}

describe('DARA decisionEngine — Step workflow and triage thresholds', () => {
  test('Step 1: when confirmed_flags is missing, returns propose_flags mode and score null', () => {
    const payload = basePayload();
    delete payload.confirmed_flags; // Step 1

    const res = runDecisionEngine(payload);

    expect(res.used_mode).toBe('propose_flags');
    expect(res.priority_score).toBeNull();
    expect(res.triage).toBe('pending_confirmation');
    expect(Array.isArray(res.suggested_flags)).toBe(true);
  });

  test('Step 1: family history provided adds a reason mentioning family history', () => {
    const payload = {
      pathway: 'oncogenetics',
      patient_age: 40,
      patient_sex: 'female',
      chief_concern: 'Cancer risk',
      clinical_notes: '',
      family_history_summary: 'Two relatives with cancer.',
      // confirmed_flags intentionally missing => Step 1
    };

    const res = runDecisionEngine(payload);

    expect(res.used_mode).toBe('propose_flags');
    expect(res.reasons.join(' ').toLowerCase()).toContain('family history');
  });

  test('empty confirmed_flags => treated as Step 1 (pending confirmation)', () => {
    const payload = basePayload({ confirmed_flags: [] });

    const res = runDecisionEngine(payload);

    expect(res.used_mode).toBe('propose_flags');
    expect(res.priority_score).toBeNull();
    expect(res.triage).toBe('pending_confirmation');
  });

  test('Step 2: score 25 (multiple_primaries) => triage discuss (>20 and <70)', () => {
    const payload = basePayload({
      confirmed_flags: ['multiple_primaries'], // weight 25 in oncogenetics
    });

    const res = runDecisionEngine(payload);

    expect(res.priority_score).toBe(25);
    expect(res.triage).toBe('discuss');
  });

  test('Step 2: score 70 boundary => triage recommended (>=70)', () => {
    const payload = basePayload({
      confirmed_flags: ['early_onset_cancer', 'multiple_relatives_cancer'], // 40 + 30 = 70
    });

    const res = runDecisionEngine(payload);

    expect(res.priority_score).toBe(70);
    expect(res.triage).toBe('recommended');
  });

  test('Score is capped at 100 when sum exceeds 100', () => {
    const payload = basePayload({
      pathway: 'prenatal',
      pregnancy_status: 'pregnant',
      gestational_weeks: 12,
      prenatal_findings: [],
      clinical_notes:
        'Abnormal ultrasound and increased nuchal translucency. History of trisomy 21.',
      family_history_summary: 'Down syndrome in the family.',
      confirmed_flags: ['abnormal_ultrasound', 'increased_nt', 'previous_aneuploidy'], // 50+40+40=130 => capped
    });

    const res = runDecisionEngine(payload);

    expect(res.priority_score).toBe(100);
    expect(res.triage).toBe('recommended');
  });

  test("Prenatal normalization: 'NIPT positive' in free text suggests positive_screening in Step 1", () => {
    const payload = {
      pathway: 'prenatal',
      patient_age: 32,
      patient_sex: 'female',
      chief_concern: 'Prenatal screening',
      clinical_notes: 'NIPT positive for trisomy 21',
      family_history_summary: '',
      pregnancy_status: 'pregnant',
      gestational_weeks: 11,
      // Step 1 (no confirmed_flags)
    };

    const res = runDecisionEngine(payload);

    expect(res.used_mode).toBe('propose_flags');
    expect(res.suggested_flags).toContain('positive_screening');
  });

  test('Oncogenetics extra flag: mentions pancreas => suggests pancreatic_cancer in Step 1', () => {
    const payload = {
      pathway: 'oncogenetics',
      patient_age: 55,
      patient_sex: 'male',
      chief_concern: 'Cancer in family',
      clinical_notes: 'Father had pancreatic cancer',
      family_history_summary: 'Pancreas cancer mentioned.',
      // Step 1 (no confirmed_flags)
    };

    const res = runDecisionEngine(payload);

    expect(res.used_mode).toBe('propose_flags');
    expect(res.suggested_flags).toContain('pancreatic_cancer');
  });
});

it("handles invalid pathway safely", () => {
  const payload = { pathway: "invalid_pathway" };

  const result = runDecisionEngine(payload);

  expect(result).toBeDefined();
  // Must not crash; should return a readable error or safe fallback output
  expect(
    result.error || result.triage || result.proposed_flags || result.suggested_flags
  ).toBeTruthy();
});

it("keeps score within valid bounds for Step 2 (confirmed flags)", () => {
  const payload = {
    pathway: "oncogenetics",
    confirmed_flags: ["multiple_primaries"], // flag already used in your existing passing tests
  };

  const result = runDecisionEngine(payload);

  const score = getScore(result);
  expect(typeof score).toBe("number");
  expect(score).toBeGreaterThanOrEqual(0);
  expect(score).toBeLessThanOrEqual(100);

  // triage should exist in Step 2 outputs
  expect(result.triage).toBeDefined();
});

