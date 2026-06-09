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
    assert.strictEqual(finding.file, 'src/worker.js');
    assert.strictEqual(finding.line, 10);
    assert.strictEqual(finding.message, 'Test message');
    assert.strictEqual(finding.recommendation, 'Fix it');
  });

  it('validateFinding rejects invalid severity', () => {
    assert.throws(() =>
      validateFinding({ id: 's1', severity: 'invalid', dimension: 'data-flow', file: 'a.js', line: 1, message: 'x', recommendation: 'y' }),
    );
  });

  it('validateFinding rejects invalid dimension', () => {
    assert.throws(() =>
      validateFinding({ id: 'd1', severity: 'medium', dimension: 'invalid', file: 'a.js', line: 1, message: 'x', recommendation: 'y' }),
    );
  });

  it('validateFinding rejects invalid line numbers', () => {
    assert.throws(() => validateFinding({ id: 'l1', severity: 'medium', dimension: 'data-flow', file: 'a.js', line: -1, message: 'x', recommendation: 'y' }));
    assert.throws(() => validateFinding({ id: 'l2', severity: 'medium', dimension: 'data-flow', file: 'a.js', line: NaN, message: 'x', recommendation: 'y' }));
    assert.throws(() => validateFinding({ id: 'l3', severity: 'medium', dimension: 'data-flow', file: 'a.js', line: Infinity, message: 'x', recommendation: 'y' }));
  });
});
