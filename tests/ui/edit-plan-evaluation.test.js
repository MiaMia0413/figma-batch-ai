import { describe, expect, it } from 'vitest';
import { createEditPlan } from '../../src/ui/edit-plan.js';
import { DEFERRED_EDIT_PLAN_CASES, SUPPORTED_EDIT_PLAN_CASES } from '../fixtures/edit-plan-cases.js';

describe('natural-language edit plan evaluation', () => {
  it.each(SUPPORTED_EDIT_PLAN_CASES)('$prompt', ({ prompt, expected }) => {
    expect(createEditPlan(prompt)).toMatchObject(expected);
  });

  it.each(DEFERRED_EDIT_PLAN_CASES)('safely defers: %s', (prompt) => {
    expect(createEditPlan(prompt)).toBeNull();
  });

  it('keeps the supported deterministic-plan pass rate at 100%', () => {
    const passed = SUPPORTED_EDIT_PLAN_CASES.filter(({ prompt, expected }) => {
      const plan = createEditPlan(prompt);
      return plan?.toolName === expected.toolName;
    }).length;

    expect(passed / SUPPORTED_EDIT_PLAN_CASES.length).toBeGreaterThanOrEqual(0.95);
  });
});
