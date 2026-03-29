// ==UserScript==
// @name         Homework Helper
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Algebra solver + multiple choice helper with auto-click
// @match        *://*/*
// @grant        GM_addStyle
// @require      https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.11.0/math.min.js
// ==/UserScript==

(function () {
  'use strict';

  // ── Styles ──────────────────────────────────────────────────────────────────
  GM_addStyle(`
    #hw-fab { position:fixed; bottom:24px; right:24px; z-index:999999;
      width:52px; height:52px; border-radius:50%; background:#111; color:#fff;
      font-size:22px; border:none; cursor:pointer; box-shadow:0 4px 16px #0005;
      display:flex; align-items:center; justify-content:center; transition:.2s; }
    #hw-fab:hover { background:#333; transform:scale(1.08); }
    #hw-panel { position:fixed; bottom:88px; right:24px; z-index:999998;
      width:320px; background:#fff; border-radius:16px; box-shadow:0 8px 32px #0003;
      font-family:system-ui,sans-serif; font-size:14px; overflow:hidden;
      display:none; flex-direction:column; }
    #hw-panel.open { display:flex; }
    #hw-header { background:#111; color:#fff; padding:12px 16px; font-weight:600;
      display:flex; justify-content:space-between; align-items:center; }
    #hw-header button { background:none; border:none; color:#fff; font-size:18px; cursor:pointer; }
    #hw-tabs { display:flex; border-bottom:1px solid #eee; }
    .hw-tab { flex:1; padding:10px; text-align:center; cursor:pointer; color:#777;
      font-size:13px; border:none; background:none; }
    .hw-tab.active { color:#111; border-bottom:2px solid #111; font-weight:600; }
    #hw-body { padding:14px; }
    #hw-input { width:100%; padding:8px 10px; border:1px solid #ddd; border-radius:8px;
      font-size:13px; outline:none; box-sizing:border-box; }
    #hw-input:focus { border-color:#111; }
    .hw-btn { width:100%; margin-top:8px; padding:9px; background:#111; color:#fff;
      border:none; border-radius:8px; cursor:pointer; font-size:13px; }
    .hw-btn:hover { background:#333; }
    .hw-btn.secondary { background:#f5f5f5; color:#111; }
    .hw-btn.secondary:hover { background:#e5e5e5; }
    #hw-result { margin-top:10px; background:#f5f5f7; border-radius:8px; padding:10px;
      font-size:13px; line-height:1.6; white-space:pre-wrap; min-height:40px; color:#333; }
    .hw-label { font-size:12px; color:#777; margin-bottom:4px; margin-top:10px; }
    #hw-mc-list { margin-top:8px; display:flex; flex-direction:column; gap:6px; }
    .hw-mc-opt { padding:8px 10px; border:1px solid #ddd; border-radius:8px;
      cursor:pointer; font-size:13px; transition:.15s; }
    .hw-mc-opt:hover { background:#f5f5f7; border-color:#aaa; }
    .hw-mc-opt.selected { border-color:#111; background:#111; color:#fff; }
    #hw-click-status { font-size:12px; color:#777; margin-top:8px; text-align:center; }
  `);

  // ── UI ───────────────────────────────────────────────────────────────────────
  const fab = document.createElement('button');
  fab.id = 'hw-fab';
  fab.textContent = '✏️';
  document.body.appendChild(fab);

  const panel = document.createElement('div');
  panel.id = 'hw-panel';
  panel.innerHTML = `
    <div id="hw-header">
      <span>Homework Helper</span>
      <button id="hw-close">×</button>
    </div>
    <div id="hw-tabs">
      <button class="hw-tab active" data-tab="algebra">Algebra</button>
      <button class="hw-tab" data-tab="mc">Multiple Choice</button>
    </div>
    <div id="hw-body">
      <div id="tab-algebra">
        <div class="hw-label">Enter equation or expression</div>
        <input id="hw-input" type="text" placeholder="e.g. 2x + 4 = 10  or  x^2 - 5x + 6" />
        <button class="hw-btn" id="hw-solve">Solve</button>
        <div id="hw-result">Result will appear here...</div>
      </div>
      <div id="tab-mc" style="display:none">
        <div class="hw-label">Paste the question</div>
        <input id="hw-q-input" type="text" placeholder="Question text..." />
        <div class="hw-label">Options (one per line)</div>
        <textarea id="hw-opts-input" rows="4" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:8px;font-size:13px;box-sizing:border-box;outline:none" placeholder="A) ...\nB) ...\nC) ..."></textarea>
        <button class="hw-btn" id="hw-scan">Scan page for choices</button>
        <div id="hw-mc-list"></div>
        <div id="hw-click-status"></div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // ── Toggle ───────────────────────────────────────────────────────────────────
  fab.onclick = () => panel.classList.toggle('open');
  document.getElementById('hw-close').onclick = () => panel.classList.remove('open');

  // ── Tabs ─────────────────────────────────────────────────────────────────────
  document.querySelectorAll('.hw-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.hw-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-algebra').style.display = tab.dataset.tab === 'algebra' ? '' : 'none';
      document.getElementById('tab-mc').style.display = tab.dataset.tab === 'mc' ? '' : 'none';
    };
  });

  // ── Algebra Solver ───────────────────────────────────────────────────────────
  document.getElementById('hw-solve').onclick = () => {
    const raw = document.getElementById('hw-input').value.trim();
    const result = document.getElementById('hw-result');
    if (!raw) return;

    try {
      // Equation solver: e.g. "2x + 4 = 10"
      if (raw.includes('=')) {
        const [lhs, rhs] = raw.split('=').map(s => s.trim());
        const expr = `${lhs} - (${rhs})`;         // move everything to left side
        const vars = getVars(expr);

        if (vars.length === 1) {
          const v = vars[0];
          const answer = solveLinear(expr, v);
          if (answer !== null) {
            result.textContent = `${v} = ${round(answer)}\n\nSteps:\n1. Rewrite: ${lhs} - (${rhs}) = 0\n2. Isolate ${v}\n3. ${v} = ${round(answer)}`;
          } else {
            // Try numeric solve
            const ans = numericSolve(expr, v);
            result.textContent = ans !== null ? `${v} ≈ ${round(ans)}\n(solved numerically)` : 'Could not solve — try rewriting.';
          }
        } else if (vars.length === 0) {
          // Pure numeric check
          const val = math.evaluate(`(${lhs}) - (${rhs})`);
          result.textContent = Math.abs(val) < 1e-10 ? '✓ Both sides are equal.' : `✗ Not equal. Difference: ${round(val)}`;
        } else {
          result.textContent = `Multiple variables: ${vars.join(', ')}\nSimplified: ${math.simplify(expr).toString()}`;
        }
      } else {
        // Expression evaluation / simplification
        const simplified = math.simplify(raw).toString();
        let evaluated = '';
        try { evaluated = '\nEvaluated: ' + round(math.evaluate(raw)); } catch {}
        result.textContent = `Simplified: ${simplified}${evaluated}`;
      }
    } catch (e) {
      result.textContent = 'Could not parse. Try: 2x + 4 = 10';
    }
  };

  function getVars(expr) {
    const matches = expr.match(/[a-zA-Z]+/g) || [];
    const mathFns = ['sin','cos','tan','log','sqrt','abs','exp','pi','e'];
    return [...new Set(matches.filter(m => !mathFns.includes(m)))];
  }

  function solveLinear(expr, v) {
    try {
      // Coefficient method: ax + b = 0 → x = -b/a
      const a = math.evaluate(expr.replace(new RegExp(v, 'g'), '1')) -
                math.evaluate(expr.replace(new RegExp(v, 'g'), '0'));
      const b = math.evaluate(expr.replace(new RegExp(v, 'g'), '0'));
      if (a === 0) return null;
      return -b / a;
    } catch { return null; }
  }

  function numericSolve(expr, v, lo = -1e6, hi = 1e6) {
    const f = x => math.evaluate(expr, { [v]: x });
    let flo = f(lo), fhi = f(hi);
    if (flo * fhi > 0) return null;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) * flo <= 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  function round(n) {
    return Math.round(n * 1e8) / 1e8;
  }

  // ── Multiple Choice ──────────────────────────────────────────────────────────
  let scannedElements = [];

  document.getElementById('hw-scan').onclick = () => {
    const list = document.getElementById('hw-mc-list');
    const status = document.getElementById('hw-click-status');
    list.innerHTML = '';
    scannedElements = [];

    // Find clickable answer-like elements
    const candidates = [
      ...document.querySelectorAll('input[type="radio"], input[type="checkbox"]'),
      ...document.querySelectorAll('[class*="choice"],[class*="option"],[class*="answer"],[class*="Choice"],[class*="Option"],[class*="Answer"]'),
      ...document.querySelectorAll('label'),
    ];

    const seen = new Set();
    candidates.forEach(el => {
      const text = (el.value || el.textContent || '').trim().slice(0, 80);
      if (!text || seen.has(text)) return;
      seen.add(text);
      scannedElements.push({ el, text });

      const btn = document.createElement('div');
      btn.className = 'hw-mc-opt';
      btn.textContent = text;
      btn.onclick = () => {
        document.querySelectorAll('.hw-mc-opt').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        clickElement(el);
        status.textContent = `Clicked: "${text.slice(0, 40)}..."`;
      };
      list.appendChild(btn);
    });

    if (scannedElements.length === 0) {
      list.innerHTML = '<div style="color:#999;font-size:13px">No choices found on this page.</div>';
    } else {
      status.textContent = `Found ${scannedElements.length} option(s). Click one to select it.`;
    }
  };

  function clickElement(el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus();
    el.click();
    // Also dispatch events for JS-heavy sites
    ['mousedown','mouseup','click'].forEach(type => {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
    });
    if (el.tagName === 'INPUT') {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // Algebra input: press Enter to solve
  document.getElementById('hw-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('hw-solve').click();
  });

})();
