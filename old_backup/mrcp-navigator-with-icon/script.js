(function(){
  const data = window.QUIZ_BY_SUBJECT || {};
  const subjectNames = Object.keys(data);

  // Elements
  const subjectBadge = document.getElementById('subjectBadge');
  const startSection = document.getElementById('start');
  const startInput = document.getElementById('startIndexInput');
  const startBtn = document.getElementById('startBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const clearBtn = document.getElementById('clearBtn');

  const accordion = document.getElementById('subjectAccordion');
  const subjectToggle = document.getElementById('subjectToggle');
  const subjectLabel = document.getElementById('subjectLabel');
  const subjectPanel = document.getElementById('subjectPanel');

  const card = document.getElementById('card');
  const qnum = document.getElementById('qnum');
  const qtext = document.getElementById('qtext');
  const optionsEl = document.getElementById('options');
  const feedback = document.getElementById('feedback');
  const explanation = document.getElementById('explanation');

  const done = document.getElementById('done');
  const finalStats = document.getElementById('finalStats');
  const review = document.getElementById('review');
  const reviewList = document.getElementById('reviewList');

  const submitBtn = document.getElementById('submitBtn');
  const nextBtn = document.getElementById('nextBtn');
  const finishBtn = document.getElementById('finishBtn');
  const restartBtn = document.getElementById('restartBtn');
  const backBtn = document.getElementById('backBtn');

  const progress = document.getElementById('progress');
  const scoreEl = document.getElementById('score');

  // State
  let subject = subjectNames[0] || null;
  let pool = subject ? (Array.isArray(data[subject]) ? data[subject] : []) : [];
  let total = pool.length;
  let idx0 = 0, score = 0, selected = null, submitted = false;
  let wrongList = [];

  // Helpers
  function storageKey(name){ return "QUIZ_STATE::" + name; }
  function hasSaved(name){ try{return !!localStorage.getItem(storageKey(name))}catch(e){return false} }
  function saveState(){
    if(!subject) return;
    const payload = { idx0, score, wrongList, selected, submitted, total };
    try { localStorage.setItem(storageKey(subject), JSON.stringify(payload)); } catch(e) {}
  }
  function loadState(name){
    try {
      const raw = localStorage.getItem(storageKey(name));
      if(!raw) return null;
      return JSON.parse(raw);
    } catch(e){ return null; }
  }
  function clearState(name){ try{ localStorage.removeItem(storageKey(name)); }catch(e){} }

  function sanitizeHtml(s){
    const div = document.createElement('div');
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }

  // Inline Subject Panel
  function renderSubjectPanel(){
    subjectPanel.innerHTML = "";
    subjectNames.forEach(name => {
      const btn = document.createElement('button');
      btn.className = 'item';
      btn.setAttribute('role','option');
      btn.dataset.name = name;
      const count = (data[name]?.length || 0);
      btn.innerHTML = sanitizeHtml(name) + ` <span class="meta">(${count})</span>`;
      btn.addEventListener('click', () => {
        setSubject(name);
        collapsePanel();
      });
      subjectPanel.appendChild(btn);
    });
  }
  function expandPanel(){
    subjectPanel.classList.remove('hidden');
    subjectToggle.setAttribute('aria-expanded','true');
  }
  function collapsePanel(){
    subjectPanel.classList.add('hidden');
    subjectToggle.setAttribute('aria-expanded','false');
  }

  function setSubject(name){
    subject = name;
    subjectLabel.textContent = name;
    pool = Array.isArray(data[subject]) ? data[subject] : [];
    total = pool.length;
    if(subject){ subjectBadge.classList.remove('hidden'); subjectBadge.textContent = subject; }
    progress.textContent = "0 / " + total;
    scoreEl.textContent = "Score: 0";
    if(hasSaved(subject)){ resumeBtn.classList.remove('hidden'); clearBtn.classList.remove('hidden'); }
    else { resumeBtn.classList.add('hidden'); clearBtn.classList.add('hidden'); }
  }

  function renderProgress(){ progress.textContent = (Math.min(idx0+1, total)) + " / " + total; scoreEl.textContent = "Score: " + score; }

  function renderQuestion(){
    if(idx0 >= total){ return showDone(); }
    feedback.className = 'callout hidden'; feedback.textContent = '';
    explanation.className = 'callout hidden'; explanation.textContent = '';
    optionsEl.innerHTML = '';
    submitBtn.disabled = true; nextBtn.disabled = true;
    selected = null; submitted = false;

    const item = pool[idx0];
    qnum.textContent = `Question #${idx0+1}`;
    qtext.innerHTML = sanitizeHtml(item.question);

    item.options.forEach((opt, k) => {
      const label = document.createElement('label');
      label.className = 'option';
      const input = document.createElement('input');
      input.type = 'radio'; input.name = 'opt'; input.value = String(k);
      input.addEventListener('change', () => { selected = k; submitBtn.disabled = false; });
      const span = document.createElement('span');
      span.innerHTML = sanitizeHtml(opt);
      label.appendChild(input); label.appendChild(span);
      optionsEl.appendChild(label);
    });

    renderProgress();
    card.classList.remove('hidden');
    saveState();
  }

  function showDone(){
    card.classList.add('hidden');
    done.classList.remove('hidden');
    finalStats.textContent = `You scored ${score} out of ${total}.`;
    reviewList.innerHTML = "";
    if(wrongList.length){
      review.classList.remove('hidden');
      wrongList.forEach(w => {
        const li = document.createElement('li');
        li.className = 'rev-card';
        li.innerHTML = [
          `<div class="rev-q">#${w.qIndex+1}. ${sanitizeHtml(w.question)}</div>`,
          `<div class="rev-a"><strong>Your answer:</strong> ${sanitizeHtml(w.chosenText || "—")}</div>`,
          `<div class="rev-a"><strong>Correct:</strong> ${sanitizeHtml(w.correctText || "—")}</div>`,
          w.explanation ? `<div class="rev-exp"><strong>Explanation:</strong> ${sanitizeHtml(w.explanation)}</div>` : ""
        ].join("");
        reviewList.appendChild(li);
      });
    } else { review.classList.add('hidden'); }
    clearState(subject);
  }

  function onSubmit(e){
    if(submitted || selected === null) return;
    submitted = true;
    const item = pool[idx0];
    const correctIdx = Number.isInteger(item.correctIndex) ? item.correctIndex : -1;
    const validKey = correctIdx >= 0 && correctIdx < item.options.length;

    Array.from(optionsEl.querySelectorAll('input[type=radio]')).forEach(inp => inp.disabled = true);
    const labels = Array.from(optionsEl.querySelectorAll('.option'));
    labels.forEach((el, k) => {
      if(validKey){
        if(k === correctIdx) el.classList.add('correct');
        if(k === selected && k !== correctIdx) el.classList.add('incorrect');
      } else {
        if(k === selected) el.classList.add('incorrect');
      }
    });

    feedback.classList.remove('hidden');
    if(!validKey){
      feedback.className = 'callout incorrect';
      feedback.textContent = 'Answer key missing. Marked as practice only.';
    } else if(selected === correctIdx){
      feedback.className = 'callout correct';
      feedback.textContent = 'Correct!';
      score += 1;
    } else {
      feedback.className = 'callout incorrect';
      const correctText = (item.correctText && String(item.correctText).trim().length > 0) ? item.correctText : item.options[correctIdx];
      feedback.textContent = 'Incorrect. Correct answer: ' + correctText;
      wrongList.push({ qIndex: idx0, question: item.question, chosenText: item.options[selected], correctText, explanation: item.explanation || "" });
    }

    const expl = (item.explanation && String(item.explanation).trim().length > 0) ? item.explanation : "";
    if(expl){ explanation.classList.remove('hidden'); explanation.innerHTML = "<strong>Explanation:</strong> " + sanitizeHtml(expl); }

    nextBtn.disabled = false;
    renderProgress();
    saveState();
  }

  function onNext(e){
    if(!submitted) return;
    idx0 += 1;
    renderQuestion();
  }
  function onFinish(e){ showDone(); }

  // Boot
  (function init(){
    renderSubjectPanel();
    if(subjectNames.length){
      setSubject(subjectNames[0]);
    } else {
      subjectLabel.textContent = "No subjects found";
      subjectToggle.disabled = true;
    }
  })();

  // Events
  subjectToggle.addEventListener('click', (ev)=>{
    ev.preventDefault();
    const expanded = subjectToggle.getAttribute('aria-expanded') === 'true';
    if(expanded) collapsePanel(); else expandPanel();
  });

  startBtn.addEventListener('click', ()=>{
    const val = parseInt(startInput.value, 10);
    const startFrom = (isFinite(val) && val >= 1) ? val - 1 : 0;
    idx0 = Math.max(0, Math.min(total-1, startFrom));
    wrongList = []; score = 0;
    startSection.classList.add('hidden');
    collapsePanel();
    renderQuestion();
  });
  resumeBtn.addEventListener('click', ()=>{
    startSection.classList.add('hidden');
    const st = loadState(subject);
    if(st){
      idx0 = Math.min(Math.max(0, st.idx0), total-1);
      score = st.score || 0;
      wrongList = Array.isArray(st.wrongList) ? st.wrongList : [];
      selected = st.selected ?? null;
      submitted = !!st.submitted;
    }
    collapsePanel();
    renderQuestion();
  });
  clearBtn.addEventListener('click', ()=>{ clearState(subject); resumeBtn.classList.add('hidden'); clearBtn.classList.add('hidden'); });
  submitBtn.addEventListener('click', (e)=>{ e.preventDefault(); onSubmit(e); });
  nextBtn.addEventListener('click', (e)=>{ e.preventDefault(); onNext(e); });
  finishBtn.addEventListener('click', (e)=>{ e.preventDefault(); onFinish(e); });
  restartBtn.addEventListener('click', ()=>{
    idx0 = 0; score = 0; selected = null; submitted = false; wrongList = [];
    done.classList.add('hidden'); startSection.classList.remove('hidden');
    expandPanel();
    startInput.value = '1'; progress.textContent = "0 / " + total; scoreEl.textContent = "Score: 0";
  });
  backBtn.addEventListener('click', ()=>{ done.classList.add('hidden'); startSection.classList.remove('hidden'); expandPanel(); startInput.value='1'; });
})();