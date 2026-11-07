#!/usr/bin/env node
// Claude Code PreToolUse guard for parallel sessions (Bash and PowerShell tools).
// Rules: AGENTS.md "Git and releases"; how-to: docs/REPOSITORY.md "Parallel sessions".
// Exit 2 blocks the tool call and shows stderr to Claude. Any hook error or
// unparseable input exits 0 (fail open) after printing a warning.
// Node built-ins only; no dependencies.

import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const SHARED_CHECKOUT =
  process.env.STUDENT_STATUS_SHARED_CHECKOUT || 'C:/dev/denham-venom/student-status-app';
const MAX_DEPTH = 4;
const RULES_REF = "See AGENTS.md 'Git and releases' and docs/REPOSITORY.md 'Parallel sessions'.";

const warn = (message) => process.stderr.write(`[parallel-work-guard] warning: ${message}\n`);

// ---------- paths ----------

function toNativePath(p) {
  if (process.platform === 'win32') {
    const msys = /^\/(?:cygdrive\/|mnt\/)?([a-zA-Z])(?=\/|$)/.exec(p);
    if (msys) return `${msys[1]}:${p.slice(msys[0].length) || '/'}`;
  }
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) return path.join(homedir(), p.slice(1));
  return p;
}

function resolveFrom(base, target) {
  return path.resolve(toNativePath(base), toNativePath(target));
}

function pathKey(p) {
  let s = String(p).trim().replace(/\\/g, '/').replace(/\/+$/, '');
  s = s.replace(/^\/(?:cygdrive\/|mnt\/)?([a-zA-Z])(?=\/|$)/, '$1:');
  return s.toLowerCase();
}

const isSharedCheckout = (toplevel) => pathKey(toplevel) === pathKey(SHARED_CHECKOUT);

// ---------- git ----------

function git(cwd, args) {
  return execFileSync('git', ['-C', toNativePath(cwd), ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15000,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  }).trim();
}

function tryGit(cwd, args) {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

function isAncestor(cwd, ancestor, descendant) {
  try {
    git(cwd, ['merge-base', '--is-ancestor', ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

// ---------- command parsing ----------

// Remove heredoc bodies and PowerShell here-strings so message text is not parsed as commands.
function stripLiteralBlocks(command) {
  const noHereStrings = command
    .replace(/@'\r?\n[\s\S]*?\r?\n'@/g, "''")
    .replace(/@"\r?\n[\s\S]*?\r?\n"@/g, "''");
  const out = [];
  const pending = [];
  for (const line of noHereStrings.split(/\r?\n/)) {
    if (pending.length) {
      if (line.replace(/^\t+/, '').trim() === pending[0]) pending.shift();
      continue;
    }
    out.push(line);
    const re = /(?<!<)<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/g;
    let match;
    while ((match = re.exec(line))) pending.push(match[2]);
  }
  return out.join('\n');
}

// Split into simple-command segments (arrays of words), honouring quotes.
function tokenize(input) {
  const segments = [];
  let words = [];
  let current = '';
  let hasWord = false;
  let quote = null;
  const endWord = () => {
    if (hasWord) words.push(current);
    current = '';
    hasWord = false;
  };
  const endSegment = () => {
    endWord();
    if (words.length) segments.push(words);
    words = [];
  };
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    const next = input[i + 1];
    if (quote === "'") {
      if (c === "'") quote = null;
      else current += c;
      continue;
    }
    if (quote === '"') {
      if (c === '"') quote = null;
      else if ((c === '\\' || c === '`') && (next === '"' || next === '\\')) {
        current += next;
        i += 1;
      } else current += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      hasWord = true;
    } else if ((c === '\\' || c === '`') && (next === '\n' || (next === '\r' && input[i + 2] === '\n'))) {
      i += next === '\r' ? 2 : 1;
    } else if (c === ' ' || c === '\t' || c === '\r') {
      endWord();
    } else if (c === '#' && !hasWord) {
      while (i + 1 < input.length && input[i + 1] !== '\n') i += 1;
    } else if (c === '&' && (current.endsWith('>') || current.endsWith('<'))) {
      current += c;
    } else if (c === ';' || c === '\n' || c === '&' || c === '|' || c === '(' || c === ')') {
      endSegment();
    } else {
      current += c;
      hasWord = true;
    }
  }
  endSegment();
  return segments;
}

const exeBase = (word) =>
  String(word)
    .split(/[\\/]/)
    .pop()
    .toLowerCase()
    .replace(/\.(cmd|exe|ps1|bat|js|mjs|cjs)$/, '');

const LEADING_NOISE = new Set(['{', '}', '!', 'then', 'do', 'else', 'time', 'exec', 'nohup', 'command', 'builtin', 'sudo', 'call', 'env', 'start-process']);
const LAUNCHERS = new Set(['npx', 'bunx', 'pnpx', 'pnpm', 'yarn', 'npm', 'bun', 'x', 'exec', 'dlx', 'run', 'node']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'pwsh', 'powershell', 'cmd']);
const CD_COMMANDS = new Set(['cd', 'chdir', 'pushd', 'set-location', 'sl', 'push-location']);

function stripLeading(words) {
  let i = 0;
  while (i < words.length && (LEADING_NOISE.has(words[i].toLowerCase()) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]))) i += 1;
  return words.slice(i);
}

function findPackageJson(dir) {
  let current = toNativePath(dir);
  for (;;) {
    const candidate = path.join(current, 'package.json');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function packageScript(dir, name) {
  const file = findPackageJson(dir);
  if (!file) return null;
  try {
    const body = JSON.parse(readFileSync(file, 'utf8'))?.scripts?.[name];
    return typeof body === 'string' ? { body, dir: path.dirname(file) } : null;
  } catch (error) {
    warn(`could not read ${file}: ${error.message}`);
    return null;
  }
}

// Returns findings: { kind: 'deploy' | 'devsync' | 'git', cwd, label, ... }
function analyze(command, cwd, depth, via) {
  if (depth > MAX_DEPTH) return [];
  const findings = [];
  let effectiveCwd = cwd;
  for (const rawWords of tokenize(stripLiteralBlocks(command))) {
    const words = stripLeading(rawWords);
    if (!words.length) continue;
    const first = exeBase(words[0]);
    const label = via || words.join(' ');

    if (CD_COMMANDS.has(first)) {
      const target = words.slice(1).find((w) => !/^(-|\/d$)/i.test(w));
      if (target && !/[$%]/.test(target) && target !== '-') effectiveCwd = resolveFrom(effectiveCwd, target);
      else if (target) warn(`cannot resolve directory change "${target}"; checking from ${effectiveCwd}`);
      continue;
    }

    // Nested shells: bash -c "...", pwsh -Command "...", cmd /c ...
    if (SHELLS.has(first)) {
      const flagIndex = words.findIndex((w, i) => i > 0 && /^(-c|-lc|-command|\/c|\/k)$/i.test(w));
      if (flagIndex > 0 && flagIndex + 1 < words.length) {
        const inner = first === 'cmd' || first === 'pwsh' || first === 'powershell'
          ? words.slice(flagIndex + 1).join(' ')
          : words[flagIndex + 1];
        findings.push(...analyze(inner, effectiveCwd, depth + 1, via));
      }
    }

    // Direct Convex CLI (npx/bunx/bun x/npm exec/node_modules/.bin/convex ...)
    for (let i = 0; i < words.length; i += 1) {
      const base = exeBase(words[i]);
      const isConvex = base === 'convex' || base.startsWith('convex@') || /node_modules[\\/]convex[\\/]/i.test(words[i]);
      if (!isConvex) continue;
      const prefixOk = words.slice(0, i).every((w) => LAUNCHERS.has(exeBase(w)) || w.startsWith('-'));
      if (!prefixOk) break;
      const sub = words.slice(i + 1).find((w) => !w.startsWith('-') && exeBase(w) !== 'convex');
      if (sub === 'deploy') findings.push({ kind: 'deploy', cwd: effectiveCwd, label });
      if (sub === 'dev') findings.push({ kind: 'devsync', cwd: effectiveCwd, label });
      break;
    }

    // Package scripts: bun run X, bun X, npm run X, pnpm [run] X, yarn [run] X
    if (['bun', 'npm', 'pnpm', 'yarn'].includes(first)) {
      let scriptCwd = effectiveCwd;
      const rest = [];
      for (let i = 1; i < words.length; i += 1) {
        const w = words[i];
        const eq = /^--(cwd|prefix|dir)=(.+)$/.exec(w);
        if (eq) scriptCwd = resolveFrom(scriptCwd, eq[2]);
        else if (/^(--cwd|--prefix|--dir|-C)$/.test(w) && words[i + 1]) {
          scriptCwd = resolveFrom(scriptCwd, words[i + 1]);
          i += 1;
        } else if (!w.startsWith('-')) rest.push(w);
      }
      let name = null;
      if (rest[0] === 'run' || rest[0] === 'run-script') name = rest[1];
      else if (first !== 'npm') name = rest[0];
      const script = name ? packageScript(scriptCwd, name) : null;
      if (script) findings.push(...analyze(script.body, script.dir, depth + 1, `${first} run ${name} (${script.body})`));
    }

    // start.ps1 -Mode Dev. PowerShell also accepts -Mode:Dev, abbreviated parameter
    // names (-M, -Mo, -Mod) and a positional value; -Mode=Dev is treated the same way.
    const startIndex = words.findIndex((w) => /(^|[\\/])start\.ps1$/i.test(w));
    if (startIndex >= 0) {
      const after = words.slice(startIndex + 1);
      let mode = null;
      for (let i = 0; i < after.length; i += 1) {
        const m = /^-(?:m|mo|mod|mode)(?:[:=](.*))?$/i.exec(after[i]);
        if (m) {
          mode = m[1] ? m[1] : (after[i + 1] ?? null);
          break;
        }
      }
      if (mode === null && after.some((w) => w.toLowerCase() === 'dev')) mode = 'dev';
      if (mode && mode.toLowerCase() === 'dev') {
        const scriptDir = path.dirname(resolveFrom(effectiveCwd, words[startIndex]));
        findings.push({ kind: 'devsync', cwd: scriptDir, label });
      }
    }

    // git <subcommand>
    if (first === 'git') {
      let gitCwd = effectiveCwd;
      let i = 1;
      while (i < words.length && words[i].startsWith('-')) {
        const w = words[i];
        if (w === '-C' && words[i + 1]) {
          gitCwd = resolveFrom(gitCwd, words[i + 1]);
          i += 2;
        } else if (/^--work-tree=/.test(w)) {
          gitCwd = resolveFrom(gitCwd, w.slice('--work-tree='.length));
          i += 1;
        } else if (['-c', '--git-dir', '--work-tree', '--namespace'].includes(w)) {
          if (w === '--work-tree' && words[i + 1]) gitCwd = resolveFrom(gitCwd, words[i + 1]);
          i += 2;
        } else i += 1;
      }
      const sub = words[i];
      const args = words.slice(i + 1);
      const reason = gitRewriteReason(sub, args);
      if (reason) findings.push({ kind: 'git', cwd: gitCwd, label: words.join(' '), reason });
    }
  }
  return findings;
}

// Git option normalization. Git accepts `--opt=value` and unambiguous long-option
// prefixes (`--ha` for `--hard`), and bundles short flags (`-fdx`).
function longKey(arg) {
  const match = /^--([^=]+)/.exec(arg);
  return match ? match[1].toLowerCase() : null;
}

// True for `--name`, `--name=value` and any prefix abbreviation of `--name`.
function isLong(arg, name) {
  const key = longKey(arg);
  return key !== null && name.startsWith(key);
}

// Letters of a short-flag cluster, stopping after a flag that takes a value (`-fe n` style).
function shortFlags(arg, valueFlags = '') {
  if (!/^-[a-zA-Z]+$/.test(arg)) return '';
  let flags = '';
  for (const ch of arg.slice(1)) {
    flags += ch;
    if (valueFlags.includes(ch)) break;
  }
  return flags;
}

const anyLong = (args, ...names) => args.some((a) => names.some((name) => isLong(a, name)));
const anyShort = (args, letters, valueFlags = '') =>
  args.some((a) => [...shortFlags(a, valueFlags)].some((ch) => letters.includes(ch)));

// Commands that move the shared checkout's branch or discard working-tree edits.
function gitRewriteReason(sub, args) {
  switch (sub) {
    case 'checkout':
      if (!args.length) return null;
      if (args.includes('--')) return 'restores files and discards uncommitted edits';
      if (anyShort(args, 'bB', 'bB') || anyLong(args, 'orphan')) return 'creates and switches to a new branch';
      return 'switches branches or overwrites files';
    case 'switch':
      return 'switches branches';
    case 'stash':
      return ['list', 'show'].includes(args[0]) ? null : 'stashes or restores everyone\'s uncommitted edits';
    case 'reset':
      return anyLong(args, 'hard', 'merge', 'keep') ? 'resets the working tree' : null;
    case 'restore': {
      const staged = (anyLong(args, 'staged') || anyShort(args, 'S', 's')) && !anyLong(args, 'no-staged');
      const worktree = anyLong(args, 'worktree') || anyShort(args, 'W', 's');
      return staged && !worktree ? null : 'discards uncommitted edits';
    }
    case 'clean': {
      const dryRun = (anyLong(args, 'dry-run') || anyShort(args, 'n', 'e')) && !anyLong(args, 'no-dry-run');
      return dryRun ? null : 'deletes untracked files';
    }
    default:
      return null;
  }
}

// ---------- evaluation ----------

function evaluate(finding) {
  const toplevel = tryGit(finding.cwd, ['rev-parse', '--show-toplevel']);
  if (toplevel === null) {
    warn(`${finding.cwd} is not a readable git working tree; allowing "${finding.label}"`);
    return null;
  }

  if (finding.kind === 'git') {
    if (!isSharedCheckout(toplevel)) return null;
    return [
      `BLOCKED: \`${finding.label}\` ${finding.reason} in the shared checkout ${toplevel}.`,
      'Several sessions work in this folder at once; changing its branch or discarding files there moves or destroys their work.',
      'Work in your own worktree instead, for example (run from the shared folder; `git worktree add` is allowed):',
      '  git fetch origin && git worktree add ../wt-<feature> -b feat/<feature> origin/main',
      'then run Git commands inside ../wt-<feature>. To restore one of YOUR files, ask the owner first.',
    ].join('\n');
  }

  const branch = tryGit(finding.cwd, ['branch', '--show-current']) ?? '';
  const status = git(finding.cwd, ['status', '--porcelain']);
  const head = git(finding.cwd, ['rev-parse', 'HEAD']);
  const originMain = tryGit(finding.cwd, ['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main']);
  const dirtyCount = status ? status.split('\n').length : 0;
  const problems = [];

  if (finding.kind === 'deploy') {
    if (branch !== 'main') problems.push(`current branch is "${branch || '(detached HEAD)'}", not main`);
    if (dirtyCount) problems.push(`working tree is not clean (${dirtyCount} changed/untracked path(s) in git status --porcelain)`);
    if (!originMain) problems.push('no local origin/main ref; run `git fetch origin`');
    else if (head !== originMain) {
      if (isAncestor(finding.cwd, head, originMain)) problems.push('HEAD is behind origin/main; run `git pull --ff-only` on main');
      else if (isAncestor(finding.cwd, originMain, head)) problems.push('HEAD has commits that are not on origin/main; merge the PR on GitHub first, then pull main');
      else problems.push('HEAD has diverged from origin/main');
    }
    if (!problems.length) return null;
    return [
      `BLOCKED: \`${finding.label}\` is a PRODUCTION Convex deploy from ${toplevel}.`,
      ...problems.map((p) => `  - ${p}`),
      'Production deploys need the owner\'s explicit approval every time and run only from a clean, up-to-date main after the PR is merged:',
      '  merge PR -> git pull on main -> deploy main -> notify other sessions. Never deploy a feature branch.',
      'This check compares HEAD with your LOCAL origin/main ref; run `git fetch origin` first so it is current.',
      RULES_REF,
    ].join('\n');
  }

  // devsync
  if (dirtyCount) {
    problems.push(`working tree is not clean (${dirtyCount} changed/untracked path(s)); \`convex dev\` uploads the whole working-tree convex/ folder, including other sessions' unfinished edits`);
  }
  if (!originMain) warn('no local origin/main ref; cannot confirm the branch includes current main');
  else if (!isAncestor(finding.cwd, originMain, head)) {
    problems.push('branch does not include your local origin/main; run `git fetch origin` and rebase/merge origin/main first (a sync from an old base removes functions other features already shipped)');
  }
  if (!problems.length) return null;
  return [
    `BLOCKED: \`${finding.label}\` synchronizes the development Convex deployment from ${toplevel} (branch ${branch || '(detached HEAD)'}).`,
    ...problems.map((p) => `  - ${p}`),
    'Sync only from your own worktree with a clean tree whose branch includes current origin/main; commit your work there first,',
    'announce the target deployment, run one sync at a time, and expect it to replace whatever was synced last.',
    RULES_REF,
  ].join('\n');
}

// ---------- main ----------

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    warn('unparseable hook input; allowing the command');
    return 0;
  }
  const command = input?.tool_input?.command;
  if (typeof command !== 'string' || !command.trim()) return 0;
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();

  const messages = [];
  for (const finding of analyze(command, cwd, 0, null)) {
    try {
      const message = evaluate(finding);
      if (message && !messages.includes(message)) messages.push(message);
    } catch (error) {
      warn(`could not check "${finding.label}" (${error.message}); allowing it`);
    }
  }
  if (!messages.length) return 0;
  process.stderr.write(`${messages.join('\n\n')}\n`);
  return 2;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    warn(`hook error (${error?.message ?? error}); allowing the command`);
    process.exit(0);
  },
);
