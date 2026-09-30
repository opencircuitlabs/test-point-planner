# Test-Point Planner

`test-point-planner` creates deterministic PCB probe plans from board net data and fixture constraints. It evaluates candidate pads and vias, prioritizes critical coverage, enforces mechanical accessibility, explains every rejected location, and exports fixture coordinates and review reports.

## Features

- Board and net-input validation
- Required nets from explicit flags, net classes, or regular-expression policies
- Candidate ranking by criticality, pad diameter, clearance, and via penalty
- Probe diameter, accessible side, board-edge, and keepout checks
- Same-side fixture pitch and maximum-probe constraints
- Deterministic fallback selection and traceable rejection reasons
- Required and optional coverage metrics
- Fixture CSV, JSON plans, and Markdown reports
- Plan-to-plan coverage regression detection
- Dependency-free Node.js 18+ library and CLI

## Quick start

```bash
npm install
npm test
node src/cli.js validate examples/board.json
node src/cli.js plan examples/board.json --rules examples/rules.json --output plan.json --csv fixture.csv --markdown report.md
```

The plan command exits with code `3` when any required net is uncovered, making it suitable as a design-release gate.

## Library API

```js
import { planTestPoints, fixtureCsv, comparePlans } from '@opencircuitlabs/test-point-planner';

const plan = planTestPoints(board, {
  minDiameter: 0.9,
  minPitch: 2.54,
  edgeClearance: 1.5,
  sides: ['bottom'],
  requiredClasses: ['power'],
  requiredPatterns: ['^RESET$', '^SWD_']
});

console.log(plan.summary);
console.log(fixtureCsv(plan));
console.log(comparePlans(previousPlan, plan));
```

Board dimensions and point coordinates use the same caller-selected unit, normally millimetres. Candidate points identify a side, accessible copper diameter, optional local clearance, reference/pad origin, and whether the point is a via. Rectangular keepouts can apply to one side or both.

## Selection policy

Required and critical nets are planned before optional nets. Within a net, candidates are ranked by criticality, required status, accessible diameter, clearance, and via penalty. Stable coordinate ordering breaks ties. Each rejected candidate records diameter, side, edge, keepout, pitch, or fixture-capacity reasons.

The planner produces a fixture proposal, not a guarantee of manufacturability or test safety. Verify probe technology, solder-mask opening, mechanical stack-up, component height, fixture travel, electrical limits, and fabrication outputs with your test and manufacturing teams.

## License

MIT. See [LICENSE](LICENSE).
