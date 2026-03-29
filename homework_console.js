// Paste this entire block into the browser Console (F12 → Console) and press Enter

(async () => {
  await new Promise(r => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.11.0/math.min.js';
    s.onload = r; document.head.appendChild(s);
  });

  const style = document.createElement('style');
  style.textContent = `
    #hw-fab{position:fixed;bottom:24px;right:24px;z-index:999999;width:52px;height:52px;border-radius:50%;background:#111;color:#fff;font-size:22px;border:none;cursor:pointer;box-shadow:0 4px 16px #0005;display:flex;align-items:center;justify-content:center}
    #hw-fab:hover{background:#333}
    #hw-panel{position:fixed;bottom:88px;right:24px;z-index:999998;width:340px;background:#fff;border-radius:16px;box-shadow:0 8px 32px #0003;font-family:system-ui,sans-serif;font-size:14px;overflow:hidden;display:none;flex-direction:column;max-height:80vh;overflow-y:auto}
    #hw-panel.open{display:flex}
    #hw-header{background:#111;color:#fff;padding:12px 16px;font-weight:600;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:1}
    #hw-header button{background:none;border:none;color:#fff;font-size:18px;cursor:pointer}
    #hw-tabs{display:flex;border-bottom:1px solid #eee;position:sticky;top:44px;background:#fff;z-index:1}
    .hw-tab{flex:1;padding:10px;text-align:center;cursor:pointer;color:#777;font-size:13px;border:none;background:none}
    .hw-tab.active{color:#111;border-bottom:2px solid #111;font-weight:600}
    #hw-body{padding:14px}
    #hw-input{width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box}
    #hw-input:focus{border-color:#111}
    .hw-btn{width:100%;margin-top:8px;padding:9px;background:#111;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px}
    .hw-btn:hover{background:#333}
    .hw-btn.outline{background:#fff;color:#111;border:1px solid #ddd;margin-top:6px}
    .hw-btn.outline:hover{background:#f5f5f5}
    #hw-result{margin-top:10px;background:#f5f5f7;border-radius:8px;padding:10px;font-size:13px;line-height:1.6;white-space:pre-wrap;min-height:40px;color:#333}
    .hw-label{font-size:12px;color:#777;margin-bottom:4px;margin-top:10px}
    #hw-q-display{background:#f5f5f7;border-radius:8px;padding:8px 10px;font-size:12px;color:#444;margin-top:8px;line-height:1.4;max-height:60px;overflow-y:auto;display:none}
    #hw-mc-list{margin-top:8px;display:flex;flex-direction:column;gap:6px}
    .hw-mc-opt{padding:8px 10px;border:1px solid #ddd;border-radius:8px;cursor:pointer;font-size:13px;transition:.15s;display:flex;align-items:center;gap:8px}
    .hw-mc-opt:hover{background:#f5f5f7;border-color:#aaa}
    .hw-mc-opt.selected{border-color:#111;background:#111;color:#fff}
    .hw-mc-opt .opt-label{flex-shrink:0;font-weight:600;color:#888;font-size:11px}
    .hw-mc-opt.selected .opt-label{color:#aaa}
    #hw-status{font-size:12px;color:#777;margin-top:8px;text-align:center;line-height:1.5}
    #hw-search-btn{margin-top:8px}
    .hw-divider{border:none;border-top:1px solid #eee;margin:10px 0}
  `;
  document.head.appendChild(style);

  document.getElementById('hw-fab')?.remove();
  document.getElementById('hw-panel')?.remove();

  const fab = Object.assign(document.createElement('button'), { id: 'hw-fab', textContent: '✏️' });
  document.body.appendChild(fab);

  const panel = document.createElement('div');
  panel.id = 'hw-panel';
  panel.innerHTML = `
    <div id="hw-header"><span>Homework Helper</span><button id="hw-close">×</button></div>
    <div id="hw-tabs">
      <button class="hw-tab active" data-tab="algebra">Algebra</button>
      <button class="hw-tab" data-tab="mc">Multiple Choice</button>
    </div>
    <div id="hw-body">
      <div id="tab-algebra">
        <div class="hw-label">Equation or expression</div>
        <input id="hw-input" placeholder="e.g. 2x + 4 = 10" />
        <button class="hw-btn" id="hw-solve">Solve</button>
        <div id="hw-result">Result will appear here...</div>
      </div>
      <div id="tab-mc" style="display:none">
        <button class="hw-btn" id="hw-scan">📋 Scan page for question &amp; choices</button>
        <div id="hw-q-display"></div>
        <div id="hw-mc-list"></div>
        <div id="hw-status"></div>
        <hr class="hw-divider" id="hw-div" style="display:none">
        <button class="hw-btn outline" id="hw-search-btn" style="display:none">🔍 Search for answer</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  fab.onclick = () => panel.classList.toggle('open');
  document.getElementById('hw-close').onclick = () => panel.classList.remove('open');

  panel.querySelectorAll('.hw-tab').forEach(tab => {
    tab.onclick = () => {
      panel.querySelectorAll('.hw-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-algebra').style.display = tab.dataset.tab === 'algebra' ? '' : 'none';
      document.getElementById('tab-mc').style.display = tab.dataset.tab === 'mc' ? '' : 'none';
    };
  });

  // ── Algebra ────────────────────────────────────────────────────────────────
  function getVars(expr) {
    return [...new Set((expr.match(/[a-zA-Z]+/g)||[]).filter(m=>!['sin','cos','tan','log','sqrt','abs','exp','pi','e'].includes(m)))];
  }
  function round(n) { return Math.round(n * 1e8) / 1e8; }
  function solveLinear(expr, v) {
    try {
      const a = math.evaluate(expr.replace(new RegExp(v,'g'),'1')) - math.evaluate(expr.replace(new RegExp(v,'g'),'0'));
      const b = math.evaluate(expr.replace(new RegExp(v,'g'),'0'));
      return a === 0 ? null : -b / a;
    } catch { return null; }
  }
  function numericSolve(expr, v, lo=-1e6, hi=1e6) {
    const f = x => math.evaluate(expr, {[v]:x});
    if (f(lo)*f(hi) > 0) return null;
    for (let i=0;i<60;i++) { const m=(lo+hi)/2; f(m)*f(lo)<=0 ? hi=m : lo=m; }
    return (lo+hi)/2;
  }

  document.getElementById('hw-solve').onclick = () => {
    const raw = document.getElementById('hw-input').value.trim();
    const result = document.getElementById('hw-result');
    if (!raw) return;
    try {
      if (raw.includes('=')) {
        const [lhs, rhs] = raw.split('=').map(s=>s.trim());
        const expr = `${lhs}-(${rhs})`;
        const vars = getVars(expr);
        if (vars.length === 1) {
          const v = vars[0];
          const ans = solveLinear(expr, v) ?? numericSolve(expr, v);
          result.textContent = ans !== null ? `${v} = ${round(ans)}\n\nSteps:\n1. Move everything to one side\n2. Isolate ${v}\n3. ${v} = ${round(ans)}` : 'Could not solve — try rewriting.';
        } else {
          result.textContent = `Simplified: ${math.simplify(`${lhs}-(${rhs})`).toString()}`;
        }
      } else {
        const s = math.simplify(raw).toString();
        let e = ''; try { e = '\nEvaluated: ' + round(math.evaluate(raw)); } catch {}
        result.textContent = `Simplified: ${s}${e}`;
      }
    } catch { result.textContent = 'Could not parse. Try: 2x + 4 = 10'; }
  };
  document.getElementById('hw-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('hw-solve').click();
  });

  // ── Multiple Choice ────────────────────────────────────────────────────────
  let foundChoices = []; // {el, text}
  let questionText = '';

  // Noise words to exclude from answer choices
  const IGNORE_TAGS = new Set(['SCRIPT','STYLE','NAV','HEADER','FOOTER','BUTTON','A','IFRAME','IMG']);
  const IGNORE_CLASSES = ['nav','menu','header','footer','sidebar','banner','ad','cookie','modal-close','btn','button','logo'];

  function isJunk(el) {
    if (IGNORE_TAGS.has(el.tagName)) return true;
    const cls = (el.className || '').toLowerCase();
    if (IGNORE_CLASSES.some(c => cls.includes(c))) return true;
    // Skip if it's a parent of many children (likely a container, not an answer)
    if (el.querySelectorAll('*').length > 8) return true;
    return false;
  }

  function getCleanText(el) {
    return (el.value || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function looksLikeAnswer(text) {
    if (!text || text.length < 1 || text.length > 200) return false;
    // Must not be a sentence longer than ~15 words (likely a question, not an answer)
    // Actually answers CAN be sentences — just cap very long ones
    if (text.split(' ').length > 30) return false;
    return true;
  }

  function findQuestion() {
    // Look for elements that look like a question (end in ? or contain question words, not too long)
    const candidates = [...document.querySelectorAll('p,h1,h2,h3,h4,span,div,li,td,legend,fieldset > legend,.question,.prompt,[class*="question"],[class*="prompt"],[class*="stem"]')];
    for (const el of candidates) {
      if (isJunk(el)) continue;
      const text = getCleanText(el);
      if (text.endsWith('?') && text.length > 10 && text.length < 600) return text;
    }
    // Fallback: find text near radio buttons
    const radios = document.querySelectorAll('input[type="radio"]');
    if (radios.length > 0) {
      const first = radios[0];
      let el = first.closest('form,fieldset,[class*="question"],[class*="quiz"]') || first.parentElement?.parentElement;
      if (el) {
        const text = getCleanText(el).slice(0, 300);
        if (text.length > 10) return text;
      }
    }
    return '';
  }

  function smartScan() {
    const list = document.getElementById('hw-mc-list');
    const status = document.getElementById('hw-status');
    const qDisplay = document.getElementById('hw-q-display');
    list.innerHTML = '';
    foundChoices = [];

    // Priority 1: radio/checkbox inputs with associated labels
    const inputs = [...document.querySelectorAll('input[type="radio"],input[type="checkbox"]')];
    const seen = new Set();

    if (inputs.length > 0) {
      inputs.forEach(inp => {
        let text = '';
        // Try associated label
        if (inp.id) {
          const lbl = document.querySelector(`label[for="${inp.id}"]`);
          if (lbl) text = getCleanText(lbl);
        }
        // Try parent label
        if (!text) {
          const pLbl = inp.closest('label');
          if (pLbl) text = getCleanText(pLbl);
        }
        // Try next sibling text
        if (!text && inp.nextSibling) {
          text = (inp.nextSibling.textContent || '').trim();
        }
        // Fall back to input value
        if (!text) text = inp.value;

        text = text.replace(/\s+/g, ' ').trim();
        if (!text || seen.has(text) || !looksLikeAnswer(text)) return;
        seen.add(text);
        foundChoices.push({ el: inp, text });
      });
    }

    // Priority 2: elements with answer-like classes (only if no radio inputs found)
    if (foundChoices.length === 0) {
      const answerSelectors = [
        '[class*="choice"],[class*="Choice"]',
        '[class*="option"],[class*="Option"]',
        '[class*="answer"],[class*="Answer"]',
        '[class*="distractor"]',
        'li[data-choice],li[data-option]',
      ];
      document.querySelectorAll(answerSelectors.join(',')).forEach(el => {
        if (isJunk(el)) return;
        const text = getCleanText(el);
        if (!text || seen.has(text) || !looksLikeAnswer(text)) return;
        seen.add(text);
        foundChoices.push({ el, text });
      });
    }

    // Find question text
    questionText = findQuestion();
    if (questionText) {
      qDisplay.style.display = '';
      qDisplay.textContent = '❓ ' + questionText.slice(0, 200) + (questionText.length > 200 ? '...' : '');
    } else {
      qDisplay.style.display = 'none';
    }

    if (foundChoices.length === 0) {
      status.textContent = 'No answer choices found. Try clicking near the question first.';
      document.getElementById('hw-div').style.display = 'none';
      document.getElementById('hw-search-btn').style.display = 'none';
      return;
    }

    // Render options with A/B/C labels
    const letters = 'ABCDEFGHIJ';
    foundChoices.forEach(({ el, text }, i) => {
      const btn = document.createElement('div');
      btn.className = 'hw-mc-opt';
      btn.innerHTML = `<span class="opt-label">${letters[i] || i+1}</span><span>${text}</span>`;
      btn.onclick = () => {
        list.querySelectorAll('.hw-mc-opt').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus(); el.click();
        ['mousedown','mouseup','click'].forEach(t => el.dispatchEvent(new MouseEvent(t, { bubbles: true })));
        if (el.tagName === 'INPUT') { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
        status.textContent = `✓ Selected: "${text.slice(0, 50)}"`;
      };
      list.appendChild(btn);
    });

    status.textContent = `Found ${foundChoices.length} choice${foundChoices.length > 1 ? 's' : ''}`;
    document.getElementById('hw-div').style.display = '';
    document.getElementById('hw-search-btn').style.display = '';
  }

  document.getElementById('hw-scan').onclick = smartScan;

  // Search for the answer on Google
  document.getElementById('hw-search-btn').onclick = () => {
    const q = questionText || foundChoices.map(c => c.text).join(' OR ');
    if (!q) return;
    const options = foundChoices.map(c => c.text).join(' ');
    const query = encodeURIComponent((questionText || '') + ' ' + options);
    window.open(`https://www.google.com/search?q=${query}`, '_blank');
  };

  console.log('%c✏️ Homework Helper loaded!', 'color:#111;font-weight:bold;font-size:14px');
})();
