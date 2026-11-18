#!/usr/bin/env node
// Reviewer mode — standalone, zero dependencies.
// Usage: node server.js <path-to-site-folder> [--port 8800] [--name my-project]
// Serves the target site read-only at /site/, the reviewer UI at /, and stores
// review data in ./reviews/<name>.json (never inside the reviewed repo).

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
const siteDir = path.resolve(args.find((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--')) || '.');
const port = parseInt(opt('--port', '8800'), 10);
const baseName = path.basename(siteDir) === 'website' ? path.basename(path.dirname(siteDir)) : path.basename(siteDir);
const name = (opt('--name', '') || baseName).replace(/[^a-zA-Z0-9_-]+/g, '_');

if (!fs.existsSync(siteDir) || !fs.statSync(siteDir).isDirectory()) {
  console.error('Site folder not found: ' + siteDir);
  console.error('Usage: node server.js <path-to-site-folder> [--port 8800] [--name project]');
  process.exit(1);
}

const toolDir = __dirname;

// Review data lives INSIDE the reviewed repo (<repo>/reviews/) so a plain git pull/push syncs it.
// Layout:  reviews/rounds.json · reviews/comments/<uid>.json (one file per comment, avoids merge
// conflicts) · reviews/HISTORY.md (append-only log). Override with --data <dir>.
function gitRoot() {
  try { return execSync('git rev-parse --show-toplevel', { cwd: siteDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return null; }
}
const root = gitRoot();
const reviewsDir = path.resolve(opt('--data', '') || (root ? path.join(root, 'reviews') : path.join(toolDir, 'reviews', name)));
const commentsDir = path.join(reviewsDir, 'comments');
const roundsFile = path.join(reviewsDir, 'rounds.json');
const historyFile = path.join(reviewsDir, 'HISTORY.md');
fs.mkdirSync(commentsDir, { recursive: true });

function loadReview() {
  if (!fs.existsSync(roundsFile)) return null;
  const meta = JSON.parse(fs.readFileSync(roundsFile, 'utf8'));
  const comments = [];
  for (const f of fs.readdirSync(commentsDir)) {
    if (!f.endsWith('.json')) continue;
    try { comments.push(JSON.parse(fs.readFileSync(path.join(commentsDir, f), 'utf8'))); } catch { /* skip half-merged file */ }
  }
  comments.sort((a, b) => a.id - b.id || String(a.createdAt).localeCompare(b.createdAt));
  return { project: meta.project, rounds: meta.rounds, comments, nextId: Math.max(0, ...comments.map(c => c.id)) + 1 };
}

const STAT = { open: 'Open', fixed: 'Fixed', verified: 'Verified', wontfix: "Won't fix" };
function writeIfChanged(file, obj) {
  const txt = JSON.stringify(obj, null, 2) + '\n';
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === txt) return false;
  fs.writeFileSync(file, txt); return true;
}
function saveReview(next) {
  for (const c of next.comments) if (!c.uid) c.uid = 'c' + c.id + '-' + Date.parse(c.createdAt || 0).toString(36); // stale/old clients
  const prev = loadReview();
  const log = [];
  const ts = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
  const short = s => String(s).replace(/\s+/g, ' ').slice(0, 100);
  const prevMap = new Map((prev ? prev.comments : []).map(c => [c.uid, c]));
  const nextUids = new Set();
  for (const c of next.comments) {
    nextUids.add(c.uid);
    const old = prevMap.get(c.uid);
    if (!old) log.push(`${ts()} · ${c.author} · #${c.id} raised (R${c.round}, ${c.severity}) on ${c.page}: ${short(c.text)}`);
    else {
      if (old.status !== c.status) log.push(`${ts()} · ${(c.thread.slice(-1)[0] || {}).who || '?'} · #${c.id} ${STAT[old.status]} → ${STAT[c.status]}`);
      for (const t of c.thread.slice(old.thread.length)) if (!t.text.startsWith('→')) log.push(`${ts()} · ${t.who} · #${c.id} replied: ${short(t.text)}`);
      if (old.text !== c.text) log.push(`${ts()} · ${c.author} · #${c.id} edited: ${short(c.text)}`);
    }
    writeIfChanged(path.join(commentsDir, c.uid + '.json'), c);
  }
  for (const [uid, old] of prevMap) if (!nextUids.has(uid)) {
    log.push(`${ts()} · #${old.id} removed (${short(old.text)})`);
    try { fs.unlinkSync(path.join(commentsDir, uid + '.json')); } catch { /* already gone */ }
  }
  const prevRounds = prev ? prev.rounds.length : 0;
  next.rounds.slice(prevRounds).forEach(r => log.push(`${ts()} · Round ${r.n} started${r.commit ? ` at ${r.commit.commit}` : ''}${r.note ? ' — ' + short(r.note) : ''}`));
  writeIfChanged(roundsFile, { project: next.project, rounds: next.rounds });
  if (log.length) {
    if (!fs.existsSync(historyFile)) fs.writeFileSync(historyFile, '# Review history\n\nAppend-only log written by Reviewer Mode.\n\n');
    fs.appendFileSync(historyFile, log.map(l => '- ' + l).join('\n') + '\n');
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8'
};

function safeJoin(root, rel) {
  const p = path.normalize(path.join(root, decodeURIComponent(rel)));
  return p.startsWith(root) ? p : null;
}

function sendFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    if (st.isDirectory()) return sendFile(res, path.join(file, 'index.html'));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}

function listPages() {
  const out = [];
  (function walk(dir, depth) {
    if (depth > 4) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (/\.html?$/i.test(e.name)) out.push(path.relative(siteDir, full).split(path.sep).join('/'));
    }
  })(siteDir, 0);
  return out.sort();
}

function gitInfo() {
  try {
    const run = c => execSync(c, { cwd: siteDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return { commit: run('git rev-parse --short HEAD'), subject: run('git log -1 --pretty=%s'), dirty: run('git status --porcelain').length > 0 };
  } catch { return null; }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > 20e6) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

// Live refresh: watch the site and the review folder, push change events to the UI over SSE.
const clients = new Set();
function watch(dir, kind) {
  let t = null;
  try {
    fs.watch(dir, { recursive: true }, (_ev, file) => {
      if (kind === 'site' && /(^|[\\/])(\.git|node_modules)([\\/]|$)/.test(String(file || ''))) return;
      clearTimeout(t);
      t = setTimeout(() => clients.forEach(r => r.write(`event: ${kind}\ndata: 1\n\n`)), 300);
    });
  } catch (e) { console.warn('  (could not watch ' + dir + ': ' + e.message + ')'); }
}
watch(siteDir, 'site');
watch(reviewsDir, 'reviews');

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    // Reviewer UI lives at /__review/ so the site itself can be served from "/" (Astro/root-relative URLs work).
    if (p === '/__review' || p === '/__review/') return sendFile(res, path.join(toolDir, 'public', 'reviewer.html'));
    if (p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      const ka = setInterval(() => res.write(': ka\n\n'), 25000);
      req.on('close', () => { clearInterval(ka); clients.delete(res); });
      return;
    }
    if (p === '/api/info') return json(res, 200, { name, host: require('os').hostname(), siteDir, pages: listPages(), git: gitInfo() });
    if (p === '/api/review') {
      if (req.method === 'GET') return json(res, 200, loadReview());
      if (req.method === 'PUT') {
        saveReview(JSON.parse(await readBody(req)));
        return json(res, 200, { ok: true });
      }
    }
    const file = safeJoin(siteDir, p.slice(1) || 'index.html');
    if (!file) { res.writeHead(403); return res.end('Forbidden'); }
    return sendFile(res, file);
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`\n  Reviewer mode  ->  http://localhost:${port}/__review/`);
  console.log(`  Reviewing      ->  ${siteDir}`);
  console.log(`  Review data    ->  ${reviewsDir}${root ? '  (inside repo: commit & push to share)' : ''}\n`);
});
