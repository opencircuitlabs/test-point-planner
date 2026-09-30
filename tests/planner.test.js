import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePlans, evaluateCandidate, fixtureCsv, planTestPoints, reportMarkdown, validateBoard } from '../src/index.js';

const point = (x, y, extras = {}) => ({ x, y, side: 'bottom', diameter: 1, ...extras });
const board = () => ({ width: 20, height: 10, nets: [
  { name: 'GND', class: 'power', required: true, points: [point(2, 2)] },
  { name: 'CLK', class: 'digital', points: [point(8, 2)] }
] });

test('validates a well-formed board', () => assert.equal(validateBoard(board()).valid, true));
test('rejects dimensions, duplicate nets, coordinates, and sides', () => {
  const value = { width: 0, height: -1, nets: [{ name: 'A', points: [point(NaN, 1, { side: 'left' })] }, { name: 'A', points: [] }] };
  assert.equal(validateBoard(value).issues.length, 5);
});
test('selects one probe per eligible net', () => {
  const plan = planTestPoints(board());
  assert.equal(plan.probes.length, 2); assert.equal(plan.summary.complete, true);
});
test('prioritizes required and critical nets', () => {
  const value = board(); value.nets[1].critical = true; value.nets[0].points = [point(2, 2)]; value.nets[1].points = [point(2.5, 2)];
  const plan = planTestPoints(value, { minPitch: 2 });
  assert.equal(plan.probes[0].net, 'CLK'); assert.equal(plan.nets.find((net) => net.name === 'GND').covered, false);
});
test('rejects candidates smaller than probe diameter', () => {
  const value = board(); value.nets[0].points[0].diameter = 0.5;
  assert.ok(planTestPoints(value).nets.find((net) => net.name === 'GND').rejected[0].reasons.includes('diameter'));
});
test('enforces side access and edge clearance', () => {
  const value = board(); value.nets[0].points = [point(0.5, 2, { side: 'top' })];
  assert.deepEqual(evaluateCandidate(value, value.nets[0], value.nets[0].points[0], { sides: ['bottom'], edgeClearance: 1 }).reasons, ['side', 'edge-clearance']);
});
test('excludes fixture keepouts', () => {
  const value = board(); value.keepouts = [{ x: 1, y: 1, width: 2, height: 2, side: 'bottom' }];
  assert.ok(planTestPoints(value).nets.find((net) => net.name === 'GND').rejected[0].reasons.includes('keepout'));
});
test('tries a fallback candidate after a rejected point', () => {
  const value = board(); value.nets[0].points = [point(0, 0, { diameter: 2 }), point(4, 4)];
  assert.equal(planTestPoints(value).probes.find((probe) => probe.net === 'GND').x, 4);
});
test('enforces probe pitch on the same side', () => {
  const value = board(); value.nets[1].points = [point(3, 2)];
  const plan = planTestPoints(value, { minPitch: 2 });
  assert.equal(plan.probes.length, 1); assert.ok(plan.nets.find((net) => net.name === 'CLK').rejected[0].reasons.includes('probe-pitch'));
});
test('allows close probes on opposite sides', () => {
  const value = board(); value.nets[1].points = [point(2.1, 2, { side: 'top' })];
  assert.equal(planTestPoints(value, { minPitch: 5 }).probes.length, 2);
});
test('applies probe count limits', () => {
  const plan = planTestPoints(board(), { maxProbes: 1 });
  assert.equal(plan.probes.length, 1); assert.ok(plan.nets.find((net) => net.name === 'CLK').rejected[0].reasons.includes('probe-limit'));
});
test('marks rule-selected classes and patterns as required', () => {
  const value = board(); value.nets[0].required = false;
  const plan = planTestPoints(value, { requiredClasses: ['power'], requiredPatterns: ['^CLK$'] });
  assert.equal(plan.summary.requiredNets, 2);
});
test('calculates incomplete required coverage', () => {
  const value = board(); value.nets[0].points = [];
  const plan = planTestPoints(value);
  assert.equal(plan.summary.requiredCoveragePercent, 0); assert.equal(plan.summary.complete, false);
});
test('exports fixture CSV', () => {
  const csv = fixtureCsv(planTestPoints(board()));
  assert.match(csv, /^ID,Net,Class/); assert.match(csv, /TP1,GND,power/);
});
test('renders coverage and rejection Markdown', () => {
  const markdown = reportMarkdown(planTestPoints(board()));
  assert.match(markdown, /Required coverage: 100.0%/); assert.match(markdown, /\| GND \| power/);
});
test('plan comparison detects lost required coverage', () => {
  const before = planTestPoints(board()); const value = board(); value.nets[0].points = []; const after = planTestPoints(value);
  const diff = comparePlans(before, after);
  assert.equal(diff.compatible, false); assert.equal(diff.changes[0].kind, 'coverage-lost');
});
test('plan comparison recognizes additions and gained coverage', () => {
  const value = board(); value.nets[1].points = [];
  const before = planTestPoints(value); const after = planTestPoints(board());
  assert.equal(comparePlans(before, after).changes[0].kind, 'coverage-gained');
});
test('rejects invalid fixture constraints', () => assert.throws(() => planTestPoints(board(), { minPitch: -1 }), /positive/));
