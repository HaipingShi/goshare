export const SEVERITIES = ['critical', 'high', 'medium', 'low'];
export const DIMENSIONS = ['data-flow', 'coupling', 'cloudflare', 'scalability'];

const REQUIRED_FIELDS = ['id', 'dimension', 'severity', 'file', 'line', 'message', 'recommendation'];

export function createFinding(partial) {
  const finding = {
    id: partial.id || 'unknown',
    dimension: partial.dimension || 'cloudflare',
    severity: partial.severity || 'low',
    file: partial.file || 'unknown',
    line: Number.isFinite(partial.line) ? partial.line : 0,
    message: partial.message || '',
    recommendation: partial.recommendation || '',
  };
  validateFinding(finding);
  return finding;
}

export function validateFinding(finding) {
  for (const field of REQUIRED_FIELDS) {
    if (finding[field] === undefined || finding[field] === null || finding[field] === '') {
      if (field === 'line') continue;
      throw new Error(`Finding missing required field: ${field}`);
    }
  }
  if (!DIMENSIONS.includes(finding.dimension)) {
    throw new Error(`Invalid dimension: ${finding.dimension}`);
  }
  if (!SEVERITIES.includes(finding.severity)) {
    throw new Error(`Invalid severity: ${finding.severity}`);
  }
  if (!Number.isFinite(finding.line) || finding.line < 0) {
    throw new Error(`Invalid line: ${finding.line}`);
  }
}
