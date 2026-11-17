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

export async function loadPele() {
  try {
    return await import('pele');
  } catch {
    const globalRoot = resolveGlobalNodeModules();
    const peleDir = join(globalRoot, 'pele');
    if (!existsSync(join(peleDir, 'package.json'))) {
      throw new Error('Package "pele" was not found. Install it with: npm install -g pele');
    }
    return await import(resolvePackageEntry(peleDir));
  }
}

function parseArgs(argv) {
  const opts = { input: null, code: null, out: null, idPrefix: 'pele' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--code' && i + 1 < argv.length) {
      opts.code = argv[++i];
    } else if (arg === '--out' && i + 1 < argv.length) {
      opts.out = argv[++i];
    } else if (arg === '--id-prefix' && i + 1 < argv.length) {
      opts.idPrefix = argv[++i];
    } else if (arg === '-h' || arg === '--help') {
      opts.help = true;
    } else if (!arg.startsWith('-') && !opts.input) {
      opts.input = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      'Usage:\n' +
      '  node render-pele.mjs <diagram.mmd> [--out <diagram.svg>] [--id-prefix <prefix>]\n' +
      '  node render-pele.mjs --code "flowchart LR; A-->B" [--out <diagram.svg>]\n' +
      '  cat diagram.mmd | node render-pele.mjs'
    );
    return;
  }

  let source = opts.code;
  if (source == null && opts.input) {
    source = readFileSync(opts.input, 'utf8');
  }
  if (source == null) {
    if (process.stdin.isTTY) {
      throw new Error('Pass <diagram.mmd>, --code "<mermaid>", or pipe Mermaid source via stdin.');
    }
    source = readFileSync(0, 'utf8');
  }

  const { render } = await loadPele();
  const { svg } = render(source, {
    idPrefix: opts.idPrefix,
    links: false,
    images: false,
  });

  if (opts.out) {
    writeFileSync(opts.out, svg, 'utf8');
  } else {
    process.stdout.write(svg);
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  main().catch((err) => {
    console.error(`[render-pele] ${err.message}`);
    process.exitCode = 1;
  });
}
