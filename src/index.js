const defaults = { minDiameter: 0.8, minPitch: 2.54, edgeClearance: 1, sides: ['top', 'bottom'], maxProbes: Infinity };
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const inside = (point, area) => point.x >= area.x && point.x <= area.x + area.width && point.y >= area.y && point.y <= area.y + area.height && (!area.side || area.side === point.side);

export function validateBoard(board) {
  const issues = [];
  if (!(board?.width > 0)) issues.push({ path: 'width', message: 'must be positive' });
  if (!(board?.height > 0)) issues.push({ path: 'height', message: 'must be positive' });
  if (!Array.isArray(board?.nets)) issues.push({ path: 'nets', message: 'must be an array' });
  const names = new Set();
  for (const [netIndex, net] of (board?.nets ?? []).entries()) {
    if (!net.name) issues.push({ path: `nets.${netIndex}.name`, message: 'is required' });
    if (names.has(net.name)) issues.push({ path: `nets.${netIndex}.name`, message: 'is duplicated' });
    names.add(net.name);
    if (!Array.isArray(net.points)) issues.push({ path: `nets.${netIndex}.points`, message: 'must be an array' });
    for (const [pointIndex, point] of (net.points ?? []).entries()) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) issues.push({ path: `nets.${netIndex}.points.${pointIndex}`, message: 'coordinates must be finite' });
      if (!['top', 'bottom'].includes(point.side)) issues.push({ path: `nets.${netIndex}.points.${pointIndex}.side`, message: 'must be top or bottom' });
    }
  }
  return { valid: issues.length === 0, issues };
}

export function evaluateCandidate(board, net, point, rules = {}) {
  const config = { ...defaults, ...rules };
  const reasons = [];
  if ((point.diameter ?? 0) < config.minDiameter) reasons.push('diameter');
  if (!config.sides.includes(point.side)) reasons.push('side');
  if (point.x < config.edgeClearance || point.y < config.edgeClearance || point.x > board.width - config.edgeClearance || point.y > board.height - config.edgeClearance) reasons.push('edge-clearance');
  if ((board.keepouts ?? []).some((area) => inside(point, area))) reasons.push('keepout');
  const score = (net.critical ? 100 : 0) + (net.required ? 50 : 0) + Math.min(point.diameter ?? 0, 3) * 10 + Math.min(point.clearance ?? 0, 5) * 2 - (point.via ? 5 : 0);
  return { eligible: reasons.length === 0, reasons, score };
}

function requiredNet(net, rules) {
  if (net.required || net.critical) return true;
  if ((rules.requiredClasses ?? []).includes(net.class)) return true;
  return (rules.requiredPatterns ?? []).some((pattern) => new RegExp(pattern).test(net.name));
}

export function planTestPoints(board, rules = {}) {
  const validation = validateBoard(board);
  if (!validation.valid) throw new Error(`Invalid board: ${validation.issues.map((item) => `${item.path} ${item.message}`).join('; ')}`);
  const config = { ...defaults, ...rules };
  if (!(config.minPitch >= 0) || !(config.minDiameter > 0) || !(config.maxProbes > 0)) throw new Error('fixture constraints must be positive');
  const selected = [];
  const nets = [];
  const ordered = [...board.nets].sort((left, right) => Number(requiredNet(right, config)) - Number(requiredNet(left, config)) || Number(right.critical) - Number(left.critical) || left.name.localeCompare(right.name));
  for (const net of ordered) {
    const required = requiredNet(net, config);
    const rejected = [];
    const candidates = (net.points ?? []).map((point, index) => ({ ...point, index, evaluation: evaluateCandidate(board, net, point, config) })).sort((left, right) => right.evaluation.score - left.evaluation.score || left.side.localeCompare(right.side) || left.x - right.x || left.y - right.y);
    let choice = null;
    for (const candidate of candidates) {
      if (!candidate.evaluation.eligible) { rejected.push({ index: candidate.index, reasons: candidate.evaluation.reasons }); continue; }
      const conflict = selected.find((probe) => probe.side === candidate.side && distance(probe, candidate) < config.minPitch);
      if (conflict) { rejected.push({ index: candidate.index, reasons: ['probe-pitch'], conflict: conflict.id }); continue; }
      if (selected.length >= config.maxProbes) { rejected.push({ index: candidate.index, reasons: ['probe-limit'] }); continue; }
      choice = { id: `TP${selected.length + 1}`, net: net.name, class: net.class ?? 'signal', x: candidate.x, y: candidate.y, side: candidate.side, diameter: candidate.diameter, reference: candidate.reference ?? null, pad: candidate.pad ?? null, score: candidate.evaluation.score };
      selected.push(choice);
      break;
    }
    nets.push({ name: net.name, class: net.class ?? 'signal', required, covered: Boolean(choice), selected: choice?.id ?? null, rejected });
  }
  nets.sort((left, right) => left.name.localeCompare(right.name));
  const required = nets.filter((net) => net.required);
  const optional = nets.filter((net) => !net.required);
  const uncoveredRequired = required.filter((net) => !net.covered);
  return {
    schemaVersion: 1,
    fixture: { minDiameter: config.minDiameter, minPitch: config.minPitch, edgeClearance: config.edgeClearance, sides: config.sides, maxProbes: Number.isFinite(config.maxProbes) ? config.maxProbes : null },
    probes: selected,
    nets,
    summary: {
      totalNets: nets.length, totalProbes: selected.length,
      requiredNets: required.length, coveredRequired: required.length - uncoveredRequired.length,
      optionalNets: optional.length, coveredOptional: optional.filter((net) => net.covered).length,
      requiredCoveragePercent: required.length ? (required.length - uncoveredRequired.length) / required.length * 100 : 100,
      complete: uncoveredRequired.length === 0
    }
  };
}

export function fixtureCsv(plan) {
  const lines = ['ID,Net,Class,X,Y,Side,Diameter,Reference,Pad'];
  for (const probe of plan.probes) lines.push([probe.id, probe.net, probe.class, probe.x, probe.y, probe.side, probe.diameter ?? '', probe.reference ?? '', probe.pad ?? ''].join(','));
  return `${lines.join('\n')}\n`;
}

export function reportMarkdown(plan) {
  const lines = ['# Test-point plan', '', `Required coverage: ${plan.summary.requiredCoveragePercent.toFixed(1)}% | Probes: ${plan.summary.totalProbes} | Complete: ${plan.summary.complete}`, '', '| Net | Class | Required | Covered | Probe | Rejections |', '| --- | --- | --- | --- | --- | --- |'];
  for (const net of plan.nets) lines.push(`| ${net.name} | ${net.class} | ${net.required} | ${net.covered} | ${net.selected ?? '-'} | ${[...new Set(net.rejected.flatMap((entry) => entry.reasons))].join(', ')} |`);
  return `${lines.join('\n')}\n`;
}

export function comparePlans(before, after) {
  const oldNets = new Map(before.nets.map((net) => [net.name, net]));
  const changes = [];
  for (const net of after.nets) {
    const previous = oldNets.get(net.name);
    if (!previous) changes.push({ net: net.name, kind: 'added', covered: net.covered });
    else if (previous.covered !== net.covered) changes.push({ net: net.name, kind: net.covered ? 'coverage-gained' : 'coverage-lost', breaking: previous.required && !net.covered });
    oldNets.delete(net.name);
  }
  for (const [name, net] of oldNets) changes.push({ net: name, kind: 'removed', breaking: net.required });
  changes.sort((left, right) => left.net.localeCompare(right.net));
  return { compatible: !changes.some((change) => change.breaking), changes };
}
