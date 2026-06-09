import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createFinding, SEVERITIES, DIMENSIONS, validateFinding } from '../../scripts/lib/audit/schemas.js';

describe('schemas', () => {
  it('createFinding returns a valid finding', () => {
    const finding = createFinding({
      id: 'test-01',
      dimension: 'data-flow',
      severity: 'medium',
      file: 'src/worker.js',
      line: 10,
      message: 'Test message',
      recommendation: 'Fix it',
    });

    assert.strictEqual(finding.id, 'test-01');
    assert.strictEqual(finding.dimension, 'data-flow');
    assert.strictEqual(finding.severity, 'medium');
  });

  it('validateFinding rejects invalid severity', () => {
    assert.throws(() =>
      validateFinding({ severity: 'invalid', dimension: 'data-flow', message: 'x' }),
    );
  });

  it('validateFinding rejects invalid dimension', () => {
    assert.throws(() =>
      validateFinding({ severity: 'medium', dimension: 'invalid', message: 'x' }),
    );
  });
});
