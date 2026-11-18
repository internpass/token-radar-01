// Token launch radar: program entry point.
//
// Pipeline, in order:
//   1. locate the sealed snapshot (a file path, or a directory holding snapshot.json)
//   2. parse it and score every pre-token protocol with the model in lib/model.ts
//   3. refuse to hand in a board the gate would reject (boardIssue is the local mirror)
//   4. write board.json and the dashboard's data.js into the output directory
//   5. copy dashboard/ and screenshots/ across, checking the screenshot names and count
//   6. write dossier.json last, with the vendored library, because the scorer rebuilds
//      the dossier from the finished output and compares it byte for byte
//
// The grader runs this file twice in a sandbox with no network and expects both runs
// to produce identical bytes, so nothing here may depend on the clock, on randomness
// or on anything outside the snapshot and this repository.
//
// Local run, from the repository root:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { buildDossier } from './vendor/makefun-board.ts';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root: dashboard/ and screenshots/ are found relative to this file. */
const repoRoot = fileURLToPath(new URL('.', import.meta.url));

/** Dossier limits, mirroring the scorer's reference caps. */
const DOSSIER_TEXT_BYTES = 65_536;
const DOSSIER_DASHBOARD = { max_files: 400, max_bytes: 4_194_304 };
const DOSSIER_SCREENSHOTS = { max: 4, max_bytes: 524_288 };

/** A screenshot name the dossier accepts: it starts with a letter, digit or underscore. */
const SCREENSHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Print a message on stderr and stop the run with the given exit code. */
function stop(message: string, code: number): never {
  process.stderr.write(`radar: ${message}\n`);
  process.exit(code);
}

/**
 * Read one `--name value` or `--name=value` option from the argument list.
 * Returns the fallback when the option is absent or has no value after it.
 */
function option(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i]!;
    if (word === `--${name}`) {
      const next = argv[i + 1];
      if (next !== undefined) return next;
    }
    if (word.startsWith(`--${name}=`)) return word.slice(name.length + 3);
  }
  return fallback;
}

/** The snapshot file behind an --input value: the value itself when it names a .json file. */
function snapshotFile(input: string): string {
  return input.endsWith('.json') ? input : join(input, 'snapshot.json');
}

/**
 * Copy every regular file directly inside `from` into `to`, skipping dotfiles.
 * Returns the names copied, in directory order. A missing source copies nothing.
 */
function mirrorFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const source = join(from, name);
    if (!statSync(source).isFile()) continue;
    copyFileSync(source, join(to, name));
    copied.push(name);
  }
  return copied;
}

/** The hand-in needs the board, one detail view and one filtered view: at least 3 images. */
function requireScreenshots(names: string[]): void {
  if (names.length < 3) {
    stop(`screenshots/ holds ${names.length} image(s); hand in 3: the board, a detail view and a filtered view`, 1);
  }
  for (const name of names) {
    if (!SCREENSHOT_NAME.test(name)) {
      stop(`screenshots/${name} is not a name the dossier accepts (letters, digits and . _ -, 1 to 128 characters)`, 1);
    }
  }
}

function run(): void {
  const input = snapshotFile(option('input', '/input'));
  if (!existsSync(input)) {
    stop(`no snapshot at ${input}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
  }
  const outDir = option('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

  const snapshot = parseSnapshot(readFileSync(input, 'utf8'));
  const { board, radar } = buildRadar(snapshot);

  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    stop(`the model wrote a board the gate refuses: ${issue}`, 1);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(outDir, 'data.js'), dataScript(radar));

  const pageFiles = mirrorFiles(join(repoRoot, 'dashboard'), join(outDir, 'dashboard'));
  const shotFiles = mirrorFiles(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));
  requireScreenshots(shotFiles);

  writeFileSync(
    join(outDir, 'dossier.json'),
    buildDossier(outDir, {
      text_max_bytes: DOSSIER_TEXT_BYTES,
      screenshots: DOSSIER_SCREENSHOTS,
      dashboard: DOSSIER_DASHBOARD,
    }),
  );

  process.stdout.write(
    `radar: snapshot of ${snapshot.protocols.length} protocols (${snapshot.watchlist.length} on the watchlist)\n` +
      `radar: scored ${board.length} rows (${radar.early_size} early below the floor, ${radar.live_size} live set aside)\n` +
      `radar: wrote board.json, data.js, dashboard/ (${pageFiles.length} files), screenshots/ (${shotFiles.length} images) and dossier.json to ${outDir}\n`,
  );
}

run();
