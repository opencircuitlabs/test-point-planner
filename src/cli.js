#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { comparePlans, fixtureCsv, planTestPoints, reportMarkdown, validateBoard } from './index.js';
const [command, first, second, ...rest] = process.argv.slice(2);
const option = (name) => { const values = process.argv.slice(2); const index = values.indexOf(`--${name}`); return index < 0 ? undefined : values[index + 1]; };
const load = async (path) => JSON.parse(await readFile(path, 'utf8'));
try {
  if (!command || command === 'help') process.stdout.write('Usage: test-point-planner <validate|plan|compare> <board.json> [plan.json] [--rules rules.json] [--output plan.json] [--csv fixture.csv] [--markdown report.md]\n');
  else if (command === 'validate' && first) { const result = validateBoard(await load(first)); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.valid) process.exitCode = 2; }
  else if (command === 'plan' && first) {
    const rules = option('rules') ? await load(option('rules')) : {};
    const result = planTestPoints(await load(first), rules);
    const json = `${JSON.stringify(result, null, 2)}\n`;
    if (option('output')) await writeFile(option('output'), json); else process.stdout.write(json);
    if (option('csv')) await writeFile(option('csv'), fixtureCsv(result));
    if (option('markdown')) await writeFile(option('markdown'), reportMarkdown(result));
    if (!result.summary.complete) process.exitCode = 3;
  } else if (command === 'compare' && first && second) process.stdout.write(`${JSON.stringify(comparePlans(await load(first), await load(second)), null, 2)}\n`);
  else throw new Error(`invalid command or arguments ${rest.join(' ')}`);
} catch (error) { process.stderr.write(`test-point-planner: ${error.message}\n`); process.exitCode = 1; }
