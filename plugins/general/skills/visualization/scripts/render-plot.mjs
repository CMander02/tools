#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function resolveGlobalNodeModules() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return execFileSync(npmCmd, ['root', '-g'], { encoding: 'utf8' }).trim();
}

function resolvePackageEntry(pkgDir) {
  const pkgJsonPath = join(pkgDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  const exp = pkg.exports;
  let rel = null;
  if (typeof exp === 'string') {
    rel = exp;
  } else if (exp && typeof exp === 'object') {
    const dot = exp['.'] ?? exp;
    if (typeof dot === 'string') {
      rel = dot;
    } else if (dot && typeof dot === 'object') {
      rel = dot.import ?? dot.default ?? dot.node ?? null;
    }
  }
  rel = rel ?? pkg.module ?? pkg.main ?? 'index.js';
  return pathToFileURL(resolve(pkgDir, rel)).href;
}

async function importLocalOrGlobal(pkgName, globalRoot) {
  try {
    return await import(pkgName);
  } catch {
    const root = globalRoot ?? resolveGlobalNodeModules();
    const pkgDir = join(root, ...pkgName.split('/'));
    if (!existsSync(join(pkgDir, 'package.json'))) {
      throw new Error(`Package "${pkgName}" was not found. Install it with: npm install -g @observablehq/plot linkedom`);
    }
    return await import(resolvePackageEntry(pkgDir));
  }
}

export async function createPlotRunner() {
  let globalRoot = null;
  const getRoot = () => {
    if (!globalRoot) globalRoot = resolveGlobalNodeModules();
    return globalRoot;
  };
  const Plot = await importLocalOrGlobal('@observablehq/plot', getRoot());
  const { parseHTML } = await importLocalOrGlobal('linkedom', getRoot());
  const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');

  function renderSvg(options) {
    const mergedStyle = {
      background: 'transparent',
      color: 'var(--foreground, currentColor)',
      fontSize: '12px',
      ...(options.style ?? {}),
    };
    const node = Plot.plot({
      ...options,
      document,
      style: mergedStyle,
    });
    return node.outerHTML;
  }

  return { Plot, document, renderSvg };
}

function parseArgs(argv) {
  const opts = { spec: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out' && i + 1 < argv.length) {
      opts.out = argv[++i];
    } else if (arg === '-h' || arg === '--help') {
      opts.help = true;
    } else if (!arg.startsWith('-') && !opts.spec) {
      opts.spec = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.spec) {
    console.log(
      'Usage:\n' +
      '  node render-plot.mjs <spec.mjs> [--out <chart.svg>]\n\n' +
      'Where <spec.mjs> exports a default function: export default (Plot) => ({ width: 640, marks: [...] })'
    );
    if (!opts.help) process.exitCode = 1;
    return;
  }

  const { Plot, document, renderSvg } = await createPlotRunner();
  const mod = await import(pathToFileURL(resolve(opts.spec)).href);
  if (typeof mod.default !== 'function') {
    throw new Error(`${opts.spec} must export a default function: export default (Plot, { document }) => plotOptions`);
  }

  const result = await mod.default(Plot, { document, renderSvg });
  const svg = typeof result === 'string'
    ? result
    : result && typeof result.outerHTML === 'string'
      ? result.outerHTML
      : renderSvg(result);

  if (opts.out) {
    writeFileSync(opts.out, svg, 'utf8');
  } else {
    process.stdout.write(svg);
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  main().catch((err) => {
    console.error(`[render-plot] ${err.message}`);
    process.exitCode = 1;
  });
}
