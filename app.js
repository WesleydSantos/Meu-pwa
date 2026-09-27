/* PRF Estudos v1.0 - Core Application Logic */

const STORAGE_KEY = 'PRF_ESTUDOS_DATA_V1';

// Estado Inicial Padrão
const defaultState = {
  settings: {
    dailyGoalMinutes: 180,
    weeklyGoalMinutes: 1260
  },
  activeDisciplineIds: [1, 2, 3, 4],
  disciplines: [
    { id: 1, name: 'Língua Portuguesa', topics: [] },
    { id: 2, name: 'Direito Constitucional', topics: [] },
    { id: 3, name: 'Direito Administrativo', topics: [] },
    { id: 4, name: 'Legislação de Trânsito', topics: [] }
  ],
  studySessions: [],
  questionSessions: [],
  reviews: [],
  errorNotebook: []
};

let appState = loadData();
let currentDisciplineId = null;

// Temporizador Global
let timerInterval = null;
let timerSeconds = 0;
let isTimerRunning = false;

// Inicialização da Aplicação
document.addEventListener('DOMContentLoaded', () => {
  initDefaultsIfNeeded();
  renderDashboard();
  populateDropdowns();
  registerServiceWorker();
  updateStreak();
});

// Persistência de Dados (LocalStorage)
function loadData() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (data) {
    try { return JSON.parse(data); } catch(e) { console.error(e); }
  }
  return JSON.parse(JSON.stringify(defaultState));
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

function initDefaultsIfNeeded() {
  if (!appState.disciplines || appState.disciplines.length === 0) {
    appState = JSON.parse(JSON.stringify(defaultState));
    saveData();
  }
}

// Navegação entre Telas
function navTo(viewId) {
  if (viewId === 'more') {
    openModal('more-modal');
    return;
  }

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.bottom-nav .nav-item').forEach(n => n.classList.remove('active'));

  const targetView = document.getElementById(`view-${viewId}`);
  if (targetView) targetView.classList.add('active');

  const navMap = { home: 0, disciplines: 1, study: 2, questions: 3, reviews: 4 };
  if (navMap[viewId] !== undefined) {
    document.querySelectorAll('.bottom-nav .nav-item')[navMap[viewId]].classList.add('active');
  }

  // Refresh das views ao navegar
  if (viewId === 'home') renderDashboard();
  if (viewId === 'disciplines') renderDisciplines();
  if (viewId === 'study') prepareStudyScreen();
  if (viewId === 'questions') prepareQuestionsScreen();
  if (viewId === 'reviews') renderReviews('today');
  if (viewId === 'errors') renderErrorNotebook();
  if (viewId === 'stats') renderStats();
}

// Modais
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// Utility Functions
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function formatHoursMinutes(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2,'0')}m`;
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

// RENDER: DASHBOARD
function renderDashboard() {
  const today = getTodayStr();

  // Horas Estudadas
  const todaySeconds = appState.studySessions
    .filter(s => s.date === today)
    .reduce((acc, s) => acc + s.durationSeconds, 0);

  const totalSeconds = appState.studySessions
    .reduce((acc, s) => acc + s.durationSeconds, 0);

  document.getElementById('dash-hours-today').innerText = formatHoursMinutes(Math.floor(todaySeconds / 60));
  document.getElementById('dash-hours-total').innerText = `Total: ${formatHoursMinutes(Math.floor(totalSeconds / 60))}`;

  // Meta Diária
  const goalMins = appState.settings.dailyGoalMinutes || 180;
  const doneMins = Math.floor(todaySeconds / 60);
  const goalPercent = Math.min(100, Math.round((doneMins / goalMins) * 100));
  
  document.getElementById('goal-progress-bar').style.width = `${goalPercent}%`;
  document.getElementById('goal-text-status').innerText = `${formatHoursMinutes(doneMins)} / ${formatHoursMinutes(goalMins)}`;
  document.getElementById('goal-text-percent').innerText = `${goalPercent}%`;

  // Questões
  const todayQuestions = appState.questionSessions.filter(q => q.date === today);
  const todayQCount = todayQuestions.reduce((acc, q) => acc + q.total, 0);
  const totalQCount = appState.questionSessions.reduce((acc, q) => acc + q.total, 0);
  const totalHits = appState.questionSessions.reduce((acc, q) => acc + q.hits, 0);

  document.getElementById('dash-questions-today').innerText = todayQCount;
  document.getElementById('dash-questions-total').innerText = `Total: ${totalQCount}`;

  const accuracy = totalQCount > 0 ? Math.round((totalHits / totalQCount) * 100) : 0;
  document.getElementById('dash-accuracy').innerText = `${accuracy}%`;
  document.getElementById('dash-accuracy-counts').innerText = `${totalHits} / ${totalQCount - totalHits}`;

  // Progresso do Edital
  let totalTopics = 0, concluded = 0, inProgress = 0, notStarted = 0;
  appState.disciplines.forEach(d => {
    d.topics.forEach(t => {
      totalTopics++;
      if (t.status === 'concluido') concluded++;
      else if (t.status === 'em_andamento') inProgress++;
      else notStarted++;
    });
  });

  const editalPercent = totalTopics > 0 ? Math.round((concluded / totalTopics) * 100) : 0;
  document.getElementById('edital-progress-bar').style.width = `${editalPercent}%`;
  document.getElementById('edital-percent-badge').innerText = `${editalPercent}%`;
  document.getElementById('edital-concluded').innerText = concluded;
  document.getElementById('edital-in-progress').innerText = inProgress;
  document.getElementById('edital-not-started').innerText = notStarted;

  // Disciplinas Atuais (4 Foco)
  const activeContainer = document.getElementById('active-subjects-list');
  activeContainer.innerHTML = '';
  
  const activeDiscs = appState.disciplines.filter(d => appState.activeDisciplineIds.includes(d.id));
  if (activeDiscs.length === 0) {
    activeContainer.innerHTML = '<p class="text-muted"><small>Nenhuma disciplina em destaque selecionada.</small></p>';
  } else {
    activeDiscs.forEach(d => {
      const topCount = d.topics.length;
      const topDone = d.topics.filter(t => t.status === 'concluido').length;
      const pct = topCount > 0 ? Math.round((topDone / topCount) * 100) : 0;

      activeContainer.innerHTML += `
        <div class="item-card" onclick="openTopicView(${d.id})">
          <div>
            <strong>${d.name}</strong>
            <small class="metric-sub">${topDone}/${topCount} assuntos concluídos</small>
          </div>
          <span class="badge ${pct === 100 ? 'badge-success' : 'badge-neutral'}">${pct}%</span>
        </div>
      `;
    });
  }
}

// Sequência / Streak Check
function updateStreak() {
  const dates = [...new Set(appState.studySessions.map(s => s.date))].sort().reverse();
  if (dates.length === 0) {
    document.getElementById('dash-streak').innerText = '0 dias';
    return;
  }

  let streak = 0;
  let checkDate = new Date();
  
  for (let i = 0; i < 30; i++) {
    const dStr = checkDate.toISOString().split('T')[0];
    if (dates.includes(dStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (i === 0) {
      // Se hoje ainda não estudou, verifica se estudou ontem antes de quebrar
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  document.getElementById('dash-streak').innerText = `${streak} ${streak === 1 ? 'dia' : 'dias'}`;
}

// Alterar Meta Diária
function setDailyGoal() {
  const current = appState.settings.dailyGoalMinutes / 60;
  const val = prompt('Defina sua meta diária em horas:', current);
  if (val !== null && !isNaN(val) && val > 0) {
    appState.settings.dailyGoalMinutes = Math.round(parseFloat(val) * 60);
    saveData();
    renderDashboard();
  }
}

// GERENCIAMENTO DE DISCIPLINAS E ASSUNTOS
function renderDisciplines() {
  const container = document.getElementById('disciplines-container');
  container.innerHTML = '';

  appState.disciplines.forEach(d => {
    const totalT = d.topics.length;
    const doneT = d.topics.filter(t => t.status === 'concluido').length;
    const pct = totalT > 0 ? Math.round((doneT / totalT) * 100) : 0;

    // Métricas de Questões da Disciplina
    const qSessions = appState.questionSessions.filter(q => q.disciplineId === d.id);
    const qTotal = qSessions.reduce((acc, q) => acc + q.total, 0);
    const qHits = qSessions.reduce((acc, q) => acc + q.hits, 0);
    const qAcc = qTotal > 0 ? Math.round((qHits / qTotal) * 100) : 0;

    container.innerHTML += `
      <div class="card" onclick="openTopicView(${d.id})">
        <div class="card-header">
          <h3>${d.name}</h3>
          <span class="badge ${pct === 100 ? 'badge-success' : 'badge-neutral'}">${pct}% concluído</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar" style="width: ${pct}%;"></div>
        </div>
        <div class="card-footer-info">
          <span>${totalT} Assuntos</span>
          <span>${qTotal} Questões (${qAcc}% acertos)</span>
        </div>
      </div>
    `;
  });
}

function handleAddDiscipline(e) {
  e.preventDefault();
  const nameInput = document.getElementById('new-disc-name');
  const name = nameInput.value.trim();
  if (!name) return;

  const newDisc = {
    id: Date.now(),
    name: name,
    topics: []
  };

  appState.disciplines.push(newDisc);
  saveData();
  nameInput.value = '';
  closeModal('add-discipline-modal');
  renderDisciplines();
}

function openTopicView(disciplineId) {
  currentDisciplineId = disciplineId;
  const disc = appState.disciplines.find(d => d.id === disciplineId);
  if (!disc) return;

  document.getElementById('current-discipline-title').innerText = disc.name;
  renderTopics();
  navTo('topics');
}

function renderTopics() {
  const container = document.getElementById('topics-container');
  container.innerHTML = '';

  const disc = appState.disciplines.find(d => d.id === currentDisciplineId);
  if (!disc || disc.topics.length === 0) {
    container.innerHTML = '<p class="text-muted text-center">Nenhum assunto cadastrado nesta disciplina.</p>';
    return;
  }

  disc.topics.forEach(t => {
    let statusClass = 'badge-neutral';
    let statusText = 'Não Iniciado';
    if (t.status === 'em_andamento') { statusClass = 'badge-warning'; statusText = 'Em Andamento'; }
    if (t.status === 'concluido') { statusClass = 'badge-success'; statusText = 'Concluído'; }

    container.innerHTML += `
      <div class="item-card">
        <div style="flex:1;">
          <strong>${t.name}</strong>
          <div>
            <span class="badge ${statusClass}">${statusText}</span>
          </div>
        </div>
        <select onchange="changeTopicStatus(${t.id}, this.value)" style="width:auto; padding:4px;">
          <option value="nao_iniciado" ${t.status==='nao_iniciado'?'selected':''}>Não Iniciado</option>
          <option value="em_andamento" ${t.status==='em_andamento'?'selected':''}>Em Andamento</option>
          <option value="concluido" ${t.status==='concluido'?'selected':''}>Concluído</option>
        </select>
      </div>
    `;
  });
}

function openAddTopicModal() {
  openModal('add-topic-modal');
}

function handleAddTopic(e) {
  e.preventDefault();
  const name = document.getElementById('new-topic-name').value.trim();
  const status = document.getElementById('new-topic-status').value;

  const disc = appState.disciplines.find(d => d.id === currentDisciplineId);
  if (disc && name) {
    disc.topics.push({
      id: Date.now(),
      name: name,
      status: status
    });
    saveData();
    closeModal('add-topic-modal');
    document.getElementById('new-topic-name').value = '';
    renderTopics();

    if (status === 'concluido') {
      promptAutoReviewCreation(disc.id, disc.topics[disc.topics.length - 1].id);
    }
  }
}

function changeTopicStatus(topicId, newStatus) {
  const disc = appState.disciplines.find(d => d.id === currentDisciplineId);
  if (disc) {
    const topic = disc.topics.find(t => t.id === topicId);
    if (topic) {
      topic.status = newStatus;
      saveData();
      if (newStatus === 'concluido') {
        promptAutoReviewCreation(disc.id, topic.id);
      }
    }
  }
}

// Configurar Disciplinas Atuais (Foco 4)
function openSelectActiveModal() {
  const container = document.getElementById('active-checklist-container');
  container.innerHTML = '';

  appState.disciplines.forEach(d => {
    const isChecked = appState.activeDisciplineIds.includes(d.id);
    container.innerHTML += `
      <label class="item-card" style="cursor:pointer;">
        <span>${d.name}</span>
        <input type="checkbox" value="${d.id}" ${isChecked ? 'checked' : ''} class="active-disc-checkbox">
      </label>
    `;
  });

  openModal('active-disciplines-modal');
}

function saveActiveDisciplines() {
  const checkboxes = document.querySelectorAll('.active-disc-checkbox:checked');
  if (checkboxes.length > 4) {
    alert('Selecione no máximo 4 disciplinas foco.');
    return;
  }

  appState.activeDisciplineIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
  saveData();
  closeModal('active-disciplines-modal');
  renderDashboard();
}

// CRONÔMETRO / TELA ESTUDAR
function prepareStudyScreen() {
  populateDisciplineSelect('timer-discipline');
  onTimerDisciplineChange();
}

function populateDisciplineSelect(elementId) {
  const select = document.getElementById(elementId);
  select.innerHTML = '';
  appState.disciplines.forEach(d => {
    select.innerHTML += `<option value="${d.id}">${d.name}</option>`;
  });
}

function onTimerDisciplineChange() {
  const discId = parseInt(document.getElementById('timer-discipline').value);
  const topicSelect = document.getElementById('timer-topic');
  topicSelect.innerHTML = '';

  const disc = appState.disciplines.find(d => d.id === discId);
  if (disc && disc.topics.length > 0) {
    disc.topics.forEach(t => {
      topicSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });
  } else {
    topicSelect.innerHTML = '<option value="">Geral / Sem assunto</option>';
  }
}

function startTimer() {
  if (isTimerRunning) return;
  isTimerRunning = true;
  document.getElementById('btn-timer-start').style.display = 'none';
  document.getElementById('btn-timer-pause').style.display = 'inline-block';
  document.getElementById('btn-timer-finish').style.display = 'inline-block';

  timerInterval = setInterval(() => {
    timerSeconds++;
    document.getElementById('timer-display').innerText = formatTime(timerSeconds);
  }, 1000);
}

function pauseTimer() {
  isTimerRunning = false;
  clearInterval(timerInterval);
  document.getElementById('btn-timer-start').style.display = 'inline-block';
  document.getElementById('btn-timer-pause').style.display = 'none';
}

function resetTimer() {
  pauseTimer();
  timerSeconds = 0;
  document.getElementById('timer-display').innerText = '00:00:00';
  document.getElementById('btn-timer-finish').style.display = 'none';
}

function finishTimer() {
  pauseTimer();
  if (timerSeconds < 60) {
    alert('Sessões com menos de 1 minuto não são registradas.');
    resetTimer();
    return;
  }

  const discId = parseInt(document.getElementById('timer-discipline').value);
  const topicId = parseInt(document.getElementById('timer-topic').value) || null;

  const session = {
    id: Date.now(),
    date: getTodayStr(),
    durationSeconds: timerSeconds,
    disciplineId: discId,
    topicId: topicId
  };

  appState.studySessions.push(session);
  saveData();
  alert(`Sessão de ${formatHoursMinutes(Math.floor(timerSeconds/60))} salva com sucesso!`);
  resetTimer();
  updateStreak();
}

// TELA REGISTRO DE QUESTÕES
function prepareQuestionsScreen() {
  populateDisciplineSelect('q-discipline');
  onQuestionsDisciplineChange();
  document.getElementById('q-date').value = getTodayStr();
}

function onQuestionsDisciplineChange() {
  const discId = parseInt(document.getElementById('q-discipline').value);
  const topicSelect = document.getElementById('q-topic');
  topicSelect.innerHTML = '';

  const disc = appState.disciplines.find(d => d.id === discId);
  if (disc && disc.topics.length > 0) {
    disc.topics.forEach(t => {
      topicSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });
  } else {
    topicSelect.innerHTML = '<option value="">Geral</option>';
  }
}

function handleSaveQuestions(e) {
  e.preventDefault();
  const discId = parseInt(document.getElementById('q-discipline').value);
  const topicId = parseInt(document.getElementById('q-topic').value) || null;
  const hits = parseInt(document.getElementById('q-hits').value) || 0;
  const errors = parseInt(document.getElementById('q-errors').value) || 0;
  const bank = document.getElementById('q-bank').value.trim();
  const date = document.getElementById('q-date').value;

  const total = hits + errors;
  if (total <= 0) {
    alert('Informe ao menos 1 questão.');
    return;
  }

  const session = {
    id: Date.now(),
    disciplineId: discId,
    topicId: topicId,
    hits: hits,
    errors: errors,
    total: total,
    bank: bank,
    date: date
  };

  appState.questionSessions.push(session);
  saveData();
  alert('Resultado de questões registrado!');
  document.getElementById('form-questions').reset();
  prepareQuestionsScreen();
}

// SISTEMA DE REVISÕES
function renderReviews(tab = 'today') {
  const container = document.getElementById('reviews-container');
  container.innerHTML = '';

  document.querySelectorAll('.tab-group .tab-btn').forEach(b => b.classList.remove('active'));
  if (tab === 'today') document.querySelectorAll('.tab-group .tab-btn')[0].classList.add('active');
  if (tab === 'upcoming') document.querySelectorAll('.tab-group .tab-btn')[1].classList.add('active');
  if (tab === 'done') document.querySelectorAll('.tab-group .tab-btn')[2].classList.add('active');

  const today = getTodayStr();
  let filtered = [];

  if (tab === 'today') {
    filtered = appState.reviews.filter(r => !r.done && r.date <= today);
  } else if (tab === 'upcoming') {
    filtered = appState.reviews.filter(r => !r.done && r.date > today);
  } else {
    filtered = appState.reviews.filter(r => r.done);
  }

  if (filtered.length === 0) {
    container.innerHTML = '<p class="text-muted text-center">Nenhuma revisão nesta categoria.</p>';
    return;
  }

  filtered.forEach(r => {
    const disc = appState.disciplines.find(d => d.id === r.disciplineId);
    let topicName = 'Geral';
    if (disc) {
      const top = disc.topics.find(t => t.id === r.topicId);
      if (top) topicName = top.name;
    }

    let statusBadge = 'badge-warning';
    if (r.done) statusBadge = 'badge-success';
    else if (r.date < today) statusBadge = 'badge-danger';

    container.innerHTML += `
      <div class="item-card">
        <div>
          <strong>${disc ? disc.name : ''}</strong>
          <p><small>${topicName}</small></p>
          <small class="text-muted">Data: ${r.date} ${r.obs ? '| ' + r.obs : ''}</small>
        </div>
        <div>
          ${!r.done ? `<button class="btn btn-success" onclick="markReviewDone(${r.id})">✓</button>` : `<span class="badge ${statusBadge}">Concluída</span>`}
        </div>
      </div>
    `;
  });
}

function switchReviewTab(tab) {
  renderReviews(tab);
}

function onReviewDisciplineChange() {
  const discId = parseInt(document.getElementById('rev-disc').value);
  const topicSelect = document.getElementById('rev-topic');
  topicSelect.innerHTML = '';

  const disc = appState.disciplines.find(d => d.id === discId);
  if (disc && disc.topics.length > 0) {
    disc.topics.forEach(t => {
      topicSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });
  } else {
    topicSelect.innerHTML = '<option value="">Geral</option>';
  }
}

function handleAddReview(e) {
  e.preventDefault();
  const discId = parseInt(document.getElementById('rev-disc').value);
  const topicId = parseInt(document.getElementById('rev-topic').value) || null;
  const date = document.getElementById('rev-date').value;
  const obs = document.getElementById('rev-obs').value.trim();

  appState.reviews.push({
    id: Date.now(),
    disciplineId: discId,
    topicId: topicId,
    date: date,
    obs: obs,
    done: false
  });

  saveData();
  closeModal('add-review-modal');
  renderReviews('today');
}

function markReviewDone(id) {
  const rev = appState.reviews.find(r => r.id === id);
  if (rev) {
    rev.done = true;
    saveData();
    renderReviews('today');
  }
}

function promptAutoReviewCreation(disciplineId, topicId) {
  if (confirm('Assunto concluído! Deseja agendar revisões automáticas (24h, 7d, 15d, 30d)?')) {
    const intervals = [1, 7, 15, 30];
    const today = new Date();

    intervals.forEach(days => {
      const revDate = new Date(today);
      revDate.setDate(revDate.getDate() + days);

      appState.reviews.push({
        id: Date.now() + Math.random(),
        disciplineId: disciplineId,
        topicId: topicId,
        date: revDate.toISOString().split('T')[0],
        obs: `Revisão de ${days} dias`,
        done: false
      });
    });

    saveData();
    alert('Revisões agendadas com sucesso!');
  }
}

// CADERNO DE ERROS
function renderErrorNotebook() {
  const container = document.getElementById('errors-container');
  container.innerHTML = '';

  if (appState.errorNotebook.length === 0) {
    container.innerHTML = '<p class="text-muted text-center">Nenhum erro registrado no caderno.</p>';
    return;
  }

  appState.errorNotebook.forEach(err => {
    const disc = appState.disciplines.find(d => d.id === err.disciplineId);

    container.innerHTML += `
      <div class="card">
        <div class="card-header">
          <strong>${disc ? disc.name : 'Disciplina'}</strong>
          <button class="btn-text text-danger" onclick="deleteError(${err.id})">Excluir</button>
        </div>
        <p><strong>Item:</strong> ${err.question}</p>
        <p class="text-danger"><small><strong>Motivo:</strong> ${err.reason}</small></p>
        <p><small><strong>Explicação:</strong> ${err.explanation}</small></p>
      </div>
    `;
  });
}

function onErrorDisciplineChange() {
  const discId = parseInt(document.getElementById('err-disc').value);
  const topicSelect = document.getElementById('err-topic');
  topicSelect.innerHTML = '';

  const disc = appState.disciplines.find(d => d.id === discId);
  if (disc && disc.topics.length > 0) {
    disc.topics.forEach(t => {
      topicSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });
  } else {
    topicSelect.innerHTML = '<option value="">Geral</option>';
  }
}

function handleAddError(e) {
  e.preventDefault();
  const discId = parseInt(document.getElementById('err-disc').value);
  const topicId = parseInt(document.getElementById('err-topic').value) || null;
  const question = document.getElementById('err-question').value.trim();
  const reason = document.getElementById('err-reason').value.trim();
  const explanation = document.getElementById('err-explanation').value.trim();

  appState.errorNotebook.push({
    id: Date.now(),
    disciplineId: discId,
    topicId: topicId,
    question: question,
    reason: reason,
    explanation: explanation,
    date: getTodayStr()
  });

  saveData();
  closeModal('add-error-modal');
  renderErrorNotebook();
}

function deleteError(id) {
  if (confirm('Remover este erro do caderno?')) {
    appState.errorNotebook = appState.errorNotebook.filter(e => e.id !== id);
    saveData();
    renderErrorNotebook();
  }
}

// ESTATÍSTICAS E PONTOS FRACOS
function renderStats() {
  // Pontos Fracos
  const weakContainer = document.getElementById('weak-points-list');
  weakContainer.innerHTML = '';

  const topicPerformance = [];

  appState.disciplines.forEach(d => {
    d.topics.forEach(t => {
      const qSessions = appState.questionSessions.filter(q => q.topicId === t.id);
      const total = qSessions.reduce((acc, q) => acc + q.total, 0);
      const hits = qSessions.reduce((acc, q) => acc + q.hits, 0);
      if (total >= 5) {
        const pct = Math.round((hits / total) * 100);
        topicPerformance.push({ discName: d.name, topicName: t.name, pct: pct, total: total });
      }
    });
  });

  topicPerformance.sort((a, b) => a.pct - b.pct);

  if (topicPerformance.length === 0) {
    weakContainer.innerHTML = '<p class="text-muted text-center"><small>Ainda não há dados suficientes (mínimo 5 questões por assunto).</small></p>';
  } else {
    topicPerformance.slice(0, 5).forEach(tp => {
      let badgeClass = 'badge-danger';
      if (tp.pct >= 60 && tp.pct < 80) badgeClass = 'badge-warning';
      if (tp.pct >= 80) badgeClass = 'badge-success';

      weakContainer.innerHTML += `
        <div class="item-card">
          <div>
            <strong>${tp.topicName}</strong>
            <small class="metric-sub">${tp.discName}</small>
          </div>
          <span class="badge ${badgeClass}">${tp.pct}% (${tp.total} q)</span>
        </div>
      `;
    });
  }

  // Desempenho por Disciplina
  const discStatsContainer = document.getElementById('stats-disciplines-list');
  discStatsContainer.innerHTML = '';

  appState.disciplines.forEach(d => {
    const qSessions = appState.questionSessions.filter(q => q.disciplineId === d.id);
    const total = qSessions.reduce((acc, q) => acc + q.total, 0);
    const hits = qSessions.reduce((acc, q) => acc + q.hits, 0);
    const pct = total > 0 ? Math.round((hits / total) * 100) : 0;

    discStatsContainer.innerHTML += `
      <div class="item-card">
        <span>${d.name}</span>
        <strong>${total > 0 ? `${pct}%` : 'Sem dados'}</strong>
      </div>
    `;
  });

  // Histórico
  const historyContainer = document.getElementById('history-container');
  historyContainer.innerHTML = '';

  const recentSessions = [...appState.studySessions].reverse().slice(0, 10);
  if (recentSessions.length === 0) {
    historyContainer.innerHTML = '<p class="text-muted text-center"><small>Sem histórico de sessões.</small></p>';
  } else {
    recentSessions.forEach(s => {
      const disc = appState.disciplines.find(d => d.id === s.disciplineId);
      historyContainer.innerHTML += `
        <div class="item-card">
          <div>
            <strong>${disc ? disc.name : 'Sessão'}</strong>
            <small class="metric-sub">${s.date}</small>
          </div>
          <span>${formatHoursMinutes(Math.floor(s.durationSeconds / 60))}</span>
        </div>
      `;
    });
  }
}

// BACKUP E EXPORTAÇÃO
function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `PRF_Estudos_Backup_${getTodayStr()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function importData(event) {
  const fileReader = new FileReader();
  fileReader.onload = function (e) {
    try {
      const parsedData = JSON.parse(e.target.result);
      if (parsedData && parsedData.disciplines) {
        appState = parsedData;
        saveData();
        alert('Dados importados com sucesso!');
        location.reload();
      } else {
        alert('Arquivo de backup inválido.');
      }
    } catch (error) {
      alert('Erro ao carregar o arquivo JSON.');
    }
  };
  fileReader.readAsText(event.target.files[0]);
}

function resetAllData() {
  if (confirm('Tem certeza? Essa ação não pode ser desfeita.')) {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }
}

// REGISTRO DE SERVICE WORKER PARA PWA
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .then(() => console.log('Service Worker Registrado'))
      .catch(err => console.error('Erro no SW:', err));
  }
}

// Helpers para Modais com População Automática
function populateDropdowns() {
  populateDisciplineSelect('rev-disc');
  onReviewDisciplineChange();
  populateDisciplineSelect('err-disc');
  onErrorDisciplineChange();
    }
