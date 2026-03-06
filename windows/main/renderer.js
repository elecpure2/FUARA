import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let currentView = 'today';
let currentSubTab = 'today';
let currentProjectId = null;
let currentDate = todayYmd();
const expandedTasks = new Set();

let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth() + 1;
let calendarPlannedCacheKey = '';
let calendarPlannedCacheData = {};
const NOTE_CATEGORIES = ['idea', 'memo', 'dev'];
let selectedNoteId = null;
let tiptapEditor = null;
let noteOriginal = null; // { title, content, category, pinned }
let activeProjectFilter = null; // { id, name } or null
let liveTodayKey = todayYmd();

// ── Init ──

async function init() {
  await loadProjects();
  await loadTasks();
  bindEvents();

  $('#date-picker').value = currentDate;

  window.orbit.onTasksChanged(() => {
    clearCalendarPlannedCache();
    loadTasks();
  });
  window.orbit.onNotesChanged(() => {
    if (currentView === 'notes') renderNotesWithSections(selectedNoteId);
  });
  window.orbit.onFocusNewTask(() => $('#new-task-title').focus());
}

// ── Projects ──

async function loadProjects() {
  const projects = await window.orbit.getProjects();
  const list = $('#project-list');
  list.innerHTML = '';

  projects.forEach(p => {
    const btn = document.createElement('button');
    const isFiltered = activeProjectFilter && activeProjectFilter.id === p.id;
    btn.className = `sidebar-item project-item${isFiltered ? ' active' : ''}`;
    btn.dataset.view = 'project';
    btn.dataset.projectId = p.id;
    btn.innerHTML = `
      <span><span class="sidebar-icon">${isFiltered ? '&#9670;' : '&#9671;'}</span> ${escHtml(p.name)}</span>
      <span class="btn-delete-project" data-id="${p.id}" title="삭제">&times;</span>
    `;
    list.appendChild(btn);
  });
}

// ── Effort Banner ──

function buildEffortMessage(stats) {
  if (!stats) return null;
  const { today, vsYesterday, vsWeekAvg } = stats;
  if (today.score === 0) return { icon: '💪', text: '오늘도 화이팅!', cls: 'neutral' };
  if (vsYesterday !== null && vsYesterday > 0) return { icon: '🔥', text: `어제보다 ${vsYesterday}% 더 했어요!`, cls: 'hot' };
  if (vsWeekAvg !== null && vsWeekAvg >= 0) return { icon: '📈', text: '이번 주 평균 이상!', cls: 'good' };
  if (vsYesterday !== null && vsYesterday <= 0) return { icon: '🌱', text: '천천히 시작해볼까요?', cls: 'calm' };
  return { icon: '💪', text: '오늘도 화이팅!', cls: 'neutral' };
}

async function renderEffortBanner(containerSel) {
  let banner = document.querySelector(`${containerSel} .effort-banner`);
  if (!window.orbit.getEffortStats) { if (banner) banner.remove(); return; }
  try {
    const stats = await window.orbit.getEffortStats();
    const msg = buildEffortMessage(stats);
    if (!msg) { if (banner) banner.remove(); return; }
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'effort-banner';
      const container = document.querySelector(containerSel);
      container.prepend(banner);
    }
    banner.className = `effort-banner effort-${msg.cls}`;
    banner.textContent = `${msg.icon} ${msg.text}`;
  } catch { if (banner) banner.remove(); }
}

// ── Tasks ──

async function loadTasks() {
  const taskList = $('#task-list');
  const calView = $('#calendar-view');
  const notesView = $('#notes-view');
  const schedView = $('#schedule-view');
  const addBar = document.querySelector('.add-task-bar');
  const addSchedBar = document.querySelector('.add-schedule-bar');
  const subTabBar = $('#sub-tab-bar');
  const headerActions = document.querySelector('.header-actions');
  updateHeaderDateButtons();

  // Hide everything first
  taskList.classList.add('hidden');
  calView.classList.add('hidden');
  notesView.classList.add('hidden');
  schedView.classList.add('hidden');
  addBar.classList.add('hidden');
  addSchedBar.classList.add('hidden');
  subTabBar.classList.add('hidden');
  $('#in-progress-section').classList.add('hidden');

  if (currentView === 'calendar') {
    calView.classList.remove('hidden');
    headerActions.classList.remove('hidden');
    $('#view-title').textContent = `${calendarYear}년 ${calendarMonth}월`;
    renderFilterBadge();
    await renderCalendar();
    return;
  }

  if (currentView === 'notes') {
    notesView.classList.remove('hidden');
    headerActions.classList.add('hidden');
    $('#view-title').textContent = '아이디어 / 메모';
    renderFilterBadge();
    await renderNotesWithSections();
    return;
  }

  if (currentView === 'schedule') {
    schedView.classList.remove('hidden');
    addSchedBar.classList.remove('hidden');
    headerActions.classList.add('hidden');
    syncDatePicker();
    const schedDateInput = $('#new-schedule-date');
    if (schedDateInput) schedDateInput.value = currentDate;
    $('#view-title').textContent = '스케줄';
    renderFilterBadge();
    await renderSchedule(currentDate);
    renderEffortBanner('#schedule-view');
    return;
  }

  // To-Do views (today / date / project)
  taskList.classList.remove('hidden');
  addBar.classList.remove('hidden');
  headerActions.classList.remove('hidden');

  // Show sub-tabs only for today/date views (not project)
  if (currentView !== 'project') {
    subTabBar.classList.remove('hidden');
    // Sync sub-tab active state
    subTabBar.querySelectorAll('.sub-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.subtab === currentSubTab);
    });
  }

  const pid = activeProjectFilter ? activeProjectFilter.id : undefined;
  let tasks;

  if (currentView === 'today') {
    currentDate = todayYmd();
    syncDatePicker();
    tasks = await window.orbit.getTodayTasks(pid);
    $('#view-title').textContent = 'To-Do';
  } else if (currentView === 'project' && currentProjectId) {
    tasks = await window.orbit.getTasksByProject(currentProjectId);
    const projects = await window.orbit.getProjects();
    const proj = projects.find(p => p.id === currentProjectId);
    $('#view-title').textContent = proj ? proj.name : '프로젝트';
  } else {
    syncDatePicker();
    tasks = await window.orbit.getTasksByDate(currentDate, pid);
    $('#view-title').textContent = currentView === 'date' && currentSubTab === 'all' ? currentDate : 'To-Do';
  }

  renderFilterBadge();
  renderTasks(tasks);
  renderInProgress(tasks);
  renderEffortBanner('.main-content');
}

// ── Project Custom Sections (inside Notes view) ──

let activeSectionTagFilter = null;
let activeNotesTab = 'notes'; // 'notes' or section ID (number)

async function renderNotesWithSections(preferredNoteId) {
  const container = $('#notes-view');
  const pid = activeProjectFilter ? activeProjectFilter.id : undefined;

  if (!pid) {
    activeNotesTab = 'notes';
    await renderNotes(preferredNoteId);
    return;
  }

  const sections = await window.orbit.getSections(pid);
  const hasSections = sections && sections.length > 0;

  if (!hasSections) {
    activeNotesTab = 'notes';
    await renderNotes(preferredNoteId);
    return;
  }

  for (const sec of sections) {
    const secItems = await window.orbit.getItems(sec.id);
    sec._itemCount = secItems ? secItems.length : 0;
  }

  const notesCount = (await window.orbit.getNotes(pid))?.length || 0;

  const tabsHtml = [
    `<button class="section-tab ${activeNotesTab === 'notes' ? 'active' : ''}" data-notes-tab="notes">&#128221; 노트 ${notesCount > 0 ? `<span class="section-tab-badge">${notesCount}</span>` : ''}</button>`,
    ...sections.map(sec => {
      const isActive = activeNotesTab === sec.id;
      const icon = sec.section_type === 'reference_doc' ? '&#128196;' : '&#128172;';
      const badge = sec._itemCount > 0 ? `<span class="section-tab-badge">${sec._itemCount}</span>` : '';
      return `<button class="section-tab ${isActive ? 'active' : ''}" data-notes-tab="${sec.id}">${icon} ${escHtml(sec.title)} ${badge}</button>`;
    }),
    `<button class="section-tab section-tab-add" id="btn-add-section" title="섹션 추가">+</button>`
  ].join('');

  const tabBarHtml = `<div class="sections-tab-bar notes-sections-tab-bar">${tabsHtml}</div>`;

  if (activeNotesTab === 'notes') {
    container.innerHTML = `${tabBarHtml}<div class="notes-tab-content" id="notes-tab-content"></div>`;
    const notesContent = $('#notes-tab-content');
    await renderNotesInto(notesContent, preferredNoteId, pid);
  } else {
    const sec = sections.find(s => s.id === activeNotesTab);
    if (!sec) {
      activeNotesTab = 'notes';
      await renderNotesWithSections(preferredNoteId);
      return;
    }
    const items = await window.orbit.getItems(sec.id);
    container.innerHTML = `
      ${tabBarHtml}
      <div class="sections-body-in-notes">
        ${renderSection(sec, items, pid)}
      </div>
    `;
    bindSectionEvents(pid);
  }

  container.querySelectorAll('.section-tab[data-notes-tab]').forEach(tab => {
    tab.addEventListener('click', async () => {
      const val = tab.dataset.notesTab;
      activeNotesTab = val === 'notes' ? 'notes' : Number(val);
      await renderNotesWithSections();
    });
  });
}

function renderSection(section, items, projectId) {
  if (section.section_type === 'reference_doc') {
    return renderReferenceDocSection(section, items);
  }
  return renderDialogueLibrarySection(section, items);
}

function renderReferenceDocSection(section, items) {
  const content = items.length > 0 ? (items[0].content || '') : '';
  return `
    <div class="section-block" data-section-id="${section.id}" data-type="reference_doc">
      <div class="section-header">
        <span class="section-title">${escHtml(section.title)}</span>
        <div class="section-actions">
          <button class="btn-section-edit-doc" data-section-id="${section.id}" title="편집">&#9998;</button>
          <button class="btn-section-delete" data-section-id="${section.id}" title="삭제">&times;</button>
        </div>
      </div>
      <div class="section-doc-content">${escHtml(content).replace(/\n/g, '<br>')}</div>
    </div>
  `;
}

function renderDialogueLibrarySection(section, items) {
  const allTags = new Set();
  items.forEach(item => {
    if (item.tags) {
      try { JSON.parse(item.tags).forEach(t => allTags.add(t)); } catch (_) {}
    }
  });

  const tagList = [...allTags].sort();
  const filtered = activeSectionTagFilter
    ? items.filter(item => {
        if (!item.tags) return false;
        try { return JSON.parse(item.tags).includes(activeSectionTagFilter); } catch (_) { return false; }
      })
    : items;

  const tagsHtml = tagList.length > 0 ? `
    <div class="section-tag-filter">
      <button class="tag-btn ${!activeSectionTagFilter ? 'active' : ''}" data-tag="">전체</button>
      ${tagList.map(t => `<button class="tag-btn ${activeSectionTagFilter === t ? 'active' : ''}" data-tag="${escHtml(t)}">${escHtml(t)}</button>`).join('')}
    </div>
  ` : '';

  const itemsHtml = filtered.map(item => {
    const tags = item.tags ? (() => { try { return JSON.parse(item.tags); } catch (_) { return []; } })() : [];
    return `
      <div class="section-item-card" data-item-id="${item.id}">
        <div class="section-item-header">
          <span class="section-item-title">${escHtml(item.title || '(제목 없음)')}</span>
          <div class="section-item-actions">
            <button class="btn-item-edit" data-item-id="${item.id}" title="편집">&#9998;</button>
            <button class="btn-item-delete" data-item-id="${item.id}" title="삭제">&times;</button>
          </div>
        </div>
        ${tags.length > 0 ? `<div class="section-item-tags">${tags.map(t => `<span class="item-tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
        ${item.content ? `<div class="section-item-content">${escHtml(item.content).replace(/\n/g, '<br>')}</div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="section-block" data-section-id="${section.id}" data-type="dialogue_library">
      <div class="section-header">
        <span class="section-title">${escHtml(section.title)}</span>
        <div class="section-actions">
          <button class="btn-section-copy-all" data-section-id="${section.id}" title="전체 복사">&#128203; 전체 복사</button>
          <button class="btn-section-add-item" data-section-id="${section.id}" title="아이템 추가">+</button>
          <button class="btn-section-delete" data-section-id="${section.id}" title="삭제">&times;</button>
        </div>
      </div>
      ${tagsHtml}
      <div class="section-items-list">
        ${itemsHtml || '<div class="section-items-empty">아이템이 없습니다</div>'}
      </div>
    </div>
  `;
}

function bindSectionEvents(projectId) {
  const addBtn = document.querySelector('#btn-add-section');
  if (addBtn) addBtn.addEventListener('click', () => showAddSectionModal(projectId));

  document.querySelectorAll('.tag-btn[data-tag]').forEach(btn => {
    btn.addEventListener('click', async () => {
      activeSectionTagFilter = btn.dataset.tag || null;
      await renderNotesWithSections();
    });
  });

  document.querySelectorAll('.btn-section-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await showConfirmDialog('이 섹션을 삭제할까요?');
      if (!ok) return;
      await window.orbit.deleteSection(Number(btn.dataset.sectionId));
      await renderNotesWithSections();
    });
  });

  document.querySelectorAll('.btn-section-add-item').forEach(btn => {
    btn.addEventListener('click', () => {
      showAddItemModal(Number(btn.dataset.sectionId), projectId);
    });
  });

  document.querySelectorAll('.btn-item-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      await window.orbit.deleteItem(Number(btn.dataset.itemId));
      await renderNotesWithSections();
    });
  });

  document.querySelectorAll('.btn-item-edit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const itemId = Number(btn.dataset.itemId);
      const allItems = await window.orbit.getAllItemsByProject(projectId);
      const item = allItems.find(i => i.id === itemId);
      if (item) showEditItemModal(item, projectId);
    });
  });

  document.querySelectorAll('.btn-section-copy-all').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sectionId = Number(btn.dataset.sectionId);
      const sections = await window.orbit.getSections(projectId);
      let md = '';

      for (const sec of sections) {
        const items = await window.orbit.getItems(sec.id);
        md += `# ${sec.title}\n\n`;
        if (sec.section_type === 'reference_doc') {
          for (const item of items) {
            if (item.content) md += `${item.content}\n\n`;
          }
        } else {
          for (const item of items) {
            const tags = item.tags ? (() => { try { return JSON.parse(item.tags).join(', '); } catch (_) { return ''; } })() : '';
            md += `## ${item.title || '(untitled)'}`;
            if (tags) md += `  [${tags}]`;
            md += '\n';
            if (item.content) md += `${item.content}\n`;
            md += '\n';
          }
        }
      }

      await navigator.clipboard.writeText(md);
      btn.textContent = '복사됨!';
      setTimeout(() => { btn.innerHTML = '&#128203; 전체 복사'; }, 1500);
    });
  });

  document.querySelectorAll('.btn-section-edit-doc').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sectionId = Number(btn.dataset.sectionId);
      const items = await window.orbit.getItems(sectionId);
      const existing = items.length > 0 ? items[0] : null;
      showEditDocModal(sectionId, existing, projectId);
    });
  });
}

function showAddSectionModal(projectId) {
  let overlay = document.getElementById('section-modal-overlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'section-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>커스텀 섹션 추가</h3>
      <input type="text" class="modal-input" id="section-title-input" placeholder="섹션 제목" />
      <select class="modal-input" id="section-type-input">
        <option value="dialogue_library">대사/아이템 라이브러리</option>
        <option value="reference_doc">참고 문서</option>
        <option value="checklist">체크리스트</option>
      </select>
      <div class="modal-actions">
        <button class="btn-cancel" id="btn-section-cancel">취소</button>
        <button class="btn-confirm" id="btn-section-confirm">추가</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#section-title-input').focus();
  overlay.querySelector('#btn-section-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#btn-section-confirm').addEventListener('click', async () => {
    const title = overlay.querySelector('#section-title-input').value.trim();
    const sectionType = overlay.querySelector('#section-type-input').value;
    if (!title) return;
    await window.orbit.createSection({ project_id: projectId, section_type: sectionType, title });
    overlay.remove();
    await renderProjectSections(projectId);
  });
  overlay.querySelector('#section-title-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') overlay.querySelector('#btn-section-confirm').click();
    if (e.key === 'Escape') overlay.remove();
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function showAddItemModal(sectionId, projectId) {
  let overlay = document.getElementById('item-modal-overlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'item-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal item-edit-modal">
      <h3>아이템 추가</h3>
      <input type="text" class="modal-input" id="item-title-input" placeholder="제목" />
      <textarea class="modal-input item-content-area" id="item-content-input" placeholder="내용 (대사 텍스트, 메모 등)" rows="5"></textarea>
      <input type="text" class="modal-input" id="item-tags-input" placeholder="태그 (쉼표 구분: Lv1, BodyTouch, 완성)" />
      <div class="modal-actions">
        <button class="btn-cancel" id="btn-item-cancel">취소</button>
        <button class="btn-confirm" id="btn-item-confirm">추가</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#item-title-input').focus();
  overlay.querySelector('#btn-item-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#btn-item-confirm').addEventListener('click', async () => {
    const title = overlay.querySelector('#item-title-input').value.trim();
    const content = overlay.querySelector('#item-content-input').value.trim();
    const tagsRaw = overlay.querySelector('#item-tags-input').value.trim();
    const tags = tagsRaw ? JSON.stringify(tagsRaw.split(',').map(t => t.trim()).filter(Boolean)) : null;
    await window.orbit.createItem({ section_id: sectionId, title: title || null, content: content || null, tags });
    overlay.remove();
    await renderProjectSections(projectId);
  });
  overlay.querySelector('#item-title-input').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') overlay.remove();
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function showEditItemModal(item, projectId) {
  let overlay = document.getElementById('item-modal-overlay');
  if (overlay) overlay.remove();

  const existingTags = item.tags ? (() => { try { return JSON.parse(item.tags).join(', '); } catch (_) { return ''; } })() : '';

  overlay = document.createElement('div');
  overlay.id = 'item-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal item-edit-modal">
      <h3>아이템 수정</h3>
      <input type="text" class="modal-input" id="item-title-input" value="${escHtml(item.title || '')}" placeholder="제목" />
      <textarea class="modal-input item-content-area" id="item-content-input" placeholder="내용" rows="5">${escHtml(item.content || '')}</textarea>
      <input type="text" class="modal-input" id="item-tags-input" value="${escHtml(existingTags)}" placeholder="태그 (쉼표 구분)" />
      <div class="modal-actions">
        <button class="btn-cancel" id="btn-item-cancel">취소</button>
        <button class="btn-confirm" id="btn-item-confirm">저장</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#item-title-input').focus();
  overlay.querySelector('#btn-item-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#btn-item-confirm').addEventListener('click', async () => {
    const title = overlay.querySelector('#item-title-input').value.trim();
    const content = overlay.querySelector('#item-content-input').value.trim();
    const tagsRaw = overlay.querySelector('#item-tags-input').value.trim();
    const tags = tagsRaw ? JSON.stringify(tagsRaw.split(',').map(t => t.trim()).filter(Boolean)) : null;
    await window.orbit.updateItem(item.id, { title: title || null, content: content || null, tags });
    overlay.remove();
    await renderProjectSections(projectId);
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function showEditDocModal(sectionId, existing, projectId) {
  let overlay = document.getElementById('item-modal-overlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'item-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal item-edit-modal">
      <h3>문서 편집</h3>
      <textarea class="modal-input item-content-area" id="doc-content-input" placeholder="내용을 입력하세요..." rows="12">${escHtml(existing?.content || '')}</textarea>
      <div class="modal-actions">
        <button class="btn-cancel" id="btn-doc-cancel">취소</button>
        <button class="btn-confirm" id="btn-doc-confirm">저장</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#doc-content-input').focus();
  overlay.querySelector('#btn-doc-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#btn-doc-confirm').addEventListener('click', async () => {
    const content = overlay.querySelector('#doc-content-input').value.trim();
    if (existing) {
      await window.orbit.updateItem(existing.id, { content: content || null });
    } else {
      await window.orbit.createItem({ section_id: sectionId, content: content || null });
    }
    overlay.remove();
    await renderProjectSections(projectId);
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function renderInProgress(tasks) {
  const section = $('#in-progress-section');
  if (!tasks) { section.classList.add('hidden'); return; }

  const running = [];
  for (const t of tasks) {
    if (t.stopwatch_started_at && t.status !== 'done') {
      running.push({
        ...t,
        _parentTitle: null,
        _isSub: false,
        _hasSubs: !!(t.subtasks && t.subtasks.length > 0),
      });
    }
    if (t.subtasks) {
      for (const s of t.subtasks) {
        if (s.stopwatch_started_at && s.status !== 'done') {
          running.push({
            ...s,
            _parentTitle: t.title,
            _isSub: true,
            _hasSubs: false,
          });
        }
      }
    }
  }

  if (running.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  section.innerHTML = `
    <div class="ip-header">진행 중</div>
    ${running.map(t => {
    const elapsed = t.stopwatch_elapsed || 0;
    const started = t.stopwatch_started_at || '';
    return `
      <div class="ip-card" data-id="${t.id}" data-sw-elapsed="${elapsed}" data-sw-started="${started}" data-has-subs="${t._hasSubs ? '1' : ''}" data-is-sub="${t._isSub ? '1' : ''}">
        <div class="ip-top">
          ${t._parentTitle ? `<span class="ip-parent">${escHtml(t._parentTitle)} ›</span>` : ''}
          <span class="ip-title">${escHtml(t.title)}</span>
        </div>
        ${t.description ? `<div class="ip-desc">${escHtml(t.description)}</div>` : ''}
        <div class="ip-bottom">
          <span class="sw-display running ip-timer" data-sw-elapsed="${elapsed}" data-sw-started="${started}">${formatSec(calcElapsed(elapsed, started))}</span>
          <div class="ip-actions">
            <button class="ip-btn ip-pause" data-id="${t.id}">⏸ 일시정지</button>
            <button class="ip-btn ip-complete" data-id="${t.id}">✓ 완료</button>
          </div>
        </div>
      </div>`;
  }).join('')}
  `;

  section.querySelectorAll('.ip-pause').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      const card = btn.closest('.ip-card');
      const elapsed = Number(card.dataset.swElapsed) || 0;
      const started = card.dataset.swStarted;
      const total = calcElapsed(elapsed, started);
      await window.orbit.updateTask(id, { stopwatch_elapsed: total, stopwatch_started_at: null });
    });
  });

  section.querySelectorAll('.ip-complete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      const card = btn.closest('.ip-card');
      const hasSubs = card?.dataset?.hasSubs === '1';
      const isSub = card?.dataset?.isSub === '1';
      if (hasSubs && !isSub) {
        const ok = await showConfirmDialog('서브태스크가 포함된 작업입니다.\n완료 목록에 추가하시겠습니까?');
        if (!ok) return;
      }
      await completeTaskWithStopwatch(id, card);
      if (!isSub) showUndoToast(id);
    });
  });
}

function renderTasks(tasks) {
  const list = $('#task-list');
  const activeTasks = (tasks || []).filter(t => t.status !== 'done');

  if (activeTasks.length === 0) {
    list.innerHTML = '<div class="empty-state">할 일이 없습니다</div>';
    updateStatus(0, 0);
    return;
  }

  if (currentView === 'today') {
    const todayBucket = [];
    const overdueBuckets = new Map();

    for (const t of activeTasks) {
      const overdueDays = getOverdueDays(t.target_date);
      if (overdueDays <= 0) {
        todayBucket.push(t);
      } else {
        if (!overdueBuckets.has(overdueDays)) overdueBuckets.set(overdueDays, []);
        overdueBuckets.get(overdueDays).push(t);
      }
    }

    let html = '';
    if (todayBucket.length > 0) {
      html += todayBucket.map(t => renderTaskCard(t)).join('');
    }

    const overdueKeys = [...overdueBuckets.keys()].sort((a, b) => a - b);
    for (const days of overdueKeys) {
      html += `<div class="task-section-divider">-- ${days}일 전 --</div>`;
      html += overdueBuckets.get(days).map(t => renderTaskCard(t)).join('');
    }

    list.innerHTML = html || '<div class="empty-state">할 일이 없습니다</div>';
  } else {
    list.innerHTML = activeTasks.map(t => renderTaskCard(t)).join('');
  }

  const allPending = [];
  activeTasks.forEach(t => {
    allPending.push(t);
    if (t.subtasks) t.subtasks.filter(s => s.status !== 'done').forEach(s => allPending.push(s));
  });
  const totalMin = allPending.reduce((s, t) => s + (t.estimate_minutes || 0), 0);
  updateStatus(allPending.length, totalMin);
}

function renderTaskCard(t) {
  const hasSubs = t.subtasks && t.subtasks.length > 0;
  const isExpanded = expandedTasks.has(t.id);
  const doneCount = hasSubs ? t.subtasks.filter(s => s.status === 'done').length : 0;
  const totalCount = hasSubs ? t.subtasks.length : 0;
  const progress = hasSubs ? Math.round((doneCount / totalCount) * 100) : 0;

  let subsHtml = '';
  if (isExpanded) {
    const subsItems = (t.subtasks || []).map(s => {
      const sSw = s.stopwatch_elapsed || 0;
      const sSwStarted = s.stopwatch_started_at || '';
      const sSwActive = sSw > 0 || sSwStarted;
      const sSwClass = sSwStarted ? 'running' : (sSw > 0 ? 'paused' : '');
      const sDoneTime = (s.status === 'done' && s.actual_minutes) ? `<span class="actual-time-badge">⏱ ${formatMinutes(s.actual_minutes)}</span>` : '';
      return `
      <div class="subtask-item ${s.status === 'done' ? 'done' : ''}" data-id="${s.id}" data-sw-elapsed="${sSw}" data-sw-started="${sSwStarted}">
        <div class="subtask-row">
          <button class="task-check sub-check ${s.status === 'done' ? 'checked' : ''}" data-id="${s.id}">&#10003;</button>
          <span class="subtask-title editable-title" data-id="${s.id}">${escHtml(s.title)}</span>
          ${sSwActive ? `<span class="sw-display sw-sub ${sSwClass}" data-sw-elapsed="${sSw}" data-sw-started="${sSwStarted}">${formatSec(calcElapsed(sSw, sSwStarted))}</span>` : ''}
          ${sDoneTime}
          <input type="number" class="subtask-est-input" data-id="${s.id}" value="${s.estimate_minutes || ''}" placeholder="분" min="0" />
          <button class="btn-task-action btn-delete-task" data-id="${s.id}" title="삭제">&times;</button>
        </div>
        ${s.description ? `<div class="subtask-desc">${escHtml(s.description)}</div>` : ''}
      </div>
    `}).join('');

    subsHtml = `
      <div class="subtask-list">
        ${subsItems}
        <div class="subtask-add-row">
          <input type="text" class="subtask-input" data-parent="${t.id}" placeholder="서브태스크 추가..." />
        </div>
      </div>
    `;
  }

  const swElapsed = t.stopwatch_elapsed || 0;
  const swStarted = t.stopwatch_started_at || '';
  const swActive = swElapsed > 0 || swStarted;
  const swClass = swStarted ? 'running' : (swElapsed > 0 ? 'paused' : '');

  return `
    <div class="task-card ${t.status === 'done' ? 'done' : ''}" data-id="${t.id}" data-has-subs="${hasSubs ? '1' : ''}" data-sw-elapsed="${swElapsed}" data-sw-started="${swStarted}">
      <div class="task-row">
        <button class="task-check ${t.status === 'done' ? 'checked' : ''}" data-id="${t.id}">&#10003;</button>
        <button class="btn-expand ${isExpanded ? 'expanded' : ''}" data-id="${t.id}">${isExpanded ? '&#9660;' : '&#9654;'}</button>
        <span class="task-title-text" data-id="${t.id}">${escHtml(t.title)}</span>
        <span class="task-meta-inline">
          ${swActive ? `<span class="sw-display ${swClass}" data-sw-elapsed="${swElapsed}" data-sw-started="${swStarted}">${formatSec(calcElapsed(swElapsed, swStarted))}</span>` : ''}
          ${hasSubs ? `<span class="progress-badge">${doneCount}/${totalCount}</span>` : ''}
          <span class="badge badge-${t.priority}">${priorityLabel(t.priority)}</span>
          ${t.estimate_minutes ? `<span class="task-estimate">${formatMinutes(t.estimate_minutes)}</span>` : ''}
          ${t.project_name ? `<span class="task-project">${escHtml(t.project_name)}</span>` : ''}
        </span>
        <div class="task-actions">
          <button class="btn-task-action btn-add-sub" data-id="${t.id}" title="서브태스크 추가">+</button>
          <button class="btn-task-action btn-delete-task" data-id="${t.id}" title="삭제">&times;</button>
        </div>
      </div>
      ${hasSubs ? `<div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${progress}%"></div></div>` : ''}
      ${isExpanded && t.description ? `<div class="task-desc">${escHtml(t.description)}</div>` : ''}
      ${subsHtml}
    </div>
  `;
}

async function renderNotes(preferredId) {
  await renderNotesInto($('#notes-view'), preferredId);
}

async function renderNotesInto(container, preferredId) {
  const pid = activeProjectFilter ? activeProjectFilter.id : undefined;
  const notes = await window.orbit.getNotes(pid);

  if (preferredId !== undefined && preferredId !== null) {
    selectedNoteId = Number(preferredId);
  }

  if (!notes || notes.length === 0) {
    selectedNoteId = null;
    container.innerHTML = `
      <div class="notes-shell notes-shell-empty">
        <div class="notes-empty-card">
          <div class="notes-empty-title">아직 노트가 없습니다</div>
          <div class="notes-empty-sub">아이디어/메모를 저장해두면 나중에 작업 계획으로 바로 옮길 수 있어요.</div>
          <button class="btn-add-note" id="btn-note-new">+ 새 노트 만들기</button>
        </div>
      </div>
    `;
    return;
  }

  if (!selectedNoteId || !notes.some(n => n.id === selectedNoteId)) {
    selectedNoteId = notes[0].id;
  }

  const selected = notes.find(n => n.id === selectedNoteId) || notes[0];
  if (!selected) return;

  const listHtml = notes.map(n => {
    const isActive = n.id === selected.id;
    const preview = stripHtml(n.content || '').trim();
    return `
      <button class="note-list-item ${isActive ? 'active' : ''}" data-id="${n.id}" title="${escHtml(n.title || '제목 없음')}">
        <div class="note-list-top">
          <span class="note-list-title">${escHtml(n.title || '제목 없음')}</span>
          ${n.pinned ? '<span class="note-list-pin">&#128204;</span>' : ''}
        </div>
        <div class="note-list-meta">${noteCategoryLabel(n.category)} · ${formatDateTime(n.updated_at)}</div>
        <div class="note-list-preview">${escHtml(preview || '세부 내용이 없습니다.')}</div>
      </button>
    `;
  }).join('');

  const editorContent = migrateNoteContent(selected.content);

  container.innerHTML = `
    <div class="notes-shell">
      <aside class="notes-left">
        <div class="notes-left-header">
          <span>아이디어 / 메모</span>
          <button class="header-date-btn" id="btn-note-new" title="새 노트">&#43;</button>
        </div>
        <div class="notes-listbook">${listHtml}</div>
      </aside>
      <section class="notes-right">
        <div class="notes-right-head">
          <input type="text" id="note-editor-title" class="note-editor-title" value="${escHtml(selected.title || '')}" placeholder="노트 제목" />
          <select id="note-editor-category" class="note-editor-category">${noteCategoryOptions(selected.category)}</select>
          <label class="note-pin-wrap" title="상단 고정">
            <input type="checkbox" id="note-editor-pinned" class="note-pin-input" ${selected.pinned ? 'checked' : ''} />
            고정
          </label>
        </div>
        <div class="note-toolbar" id="note-toolbar">
          <button class="tb-btn" data-cmd="heading" data-level="1" title="큰 제목">H1</button>
          <button class="tb-btn" data-cmd="heading" data-level="2" title="중간 제목">H2</button>
          <button class="tb-btn" data-cmd="heading" data-level="3" title="작은 제목">H3</button>
          <span class="tb-sep"></span>
          <button class="tb-btn" data-cmd="bold" title="굵게"><b>B</b></button>
          <button class="tb-btn" data-cmd="italic" title="기울기"><i>I</i></button>
          <button class="tb-btn" data-cmd="underline" title="밑줄"><u>U</u></button>
          <button class="tb-btn" data-cmd="strike" title="취소선"><s>S</s></button>
          <span class="tb-sep"></span>
          <div class="tb-dropdown">
            <button class="tb-btn" data-cmd="highlight-toggle" title="하이라이트">🖍</button>
            <div class="tb-palette tb-palette-hl hidden" id="palette-hl">
              <button class="tb-color-btn" data-hl="#fde68a" style="background:#fde68a" title="노랑"></button>
              <button class="tb-color-btn" data-hl="#bbf7d0" style="background:#bbf7d0" title="초록"></button>
              <button class="tb-color-btn" data-hl="#bfdbfe" style="background:#bfdbfe" title="파랑"></button>
              <button class="tb-color-btn" data-hl="#fecaca" style="background:#fecaca" title="빨강"></button>
              <button class="tb-color-btn" data-hl="#e9d5ff" style="background:#e9d5ff" title="보라"></button>
              <button class="tb-color-btn tb-color-none" data-hl="" title="제거">✕</button>
            </div>
          </div>
          <div class="tb-dropdown">
            <button class="tb-btn" data-cmd="color-toggle" title="글자 색">A<span class="tb-color-indicator" id="tb-color-ind"></span></button>
            <div class="tb-palette tb-palette-color hidden" id="palette-color">
              <button class="tb-color-btn" data-color="#f5f2ee" style="background:#f5f2ee" title="기본"></button>
              <button class="tb-color-btn" data-color="#ef4444" style="background:#ef4444" title="빨강"></button>
              <button class="tb-color-btn" data-color="#f97316" style="background:#f97316" title="주황"></button>
              <button class="tb-color-btn" data-color="#eab308" style="background:#eab308" title="노랑"></button>
              <button class="tb-color-btn" data-color="#22c55e" style="background:#22c55e" title="초록"></button>
              <button class="tb-color-btn" data-color="#3b82f6" style="background:#3b82f6" title="파랑"></button>
              <button class="tb-color-btn" data-color="#a855f7" style="background:#a855f7" title="보라"></button>
            </div>
          </div>
          <span class="tb-sep"></span>
          <button class="tb-btn" data-cmd="blockquote" title="인용">"</button>
          <button class="tb-btn" data-cmd="code" title="인라인 코드">&lt;/&gt;</button>
          <button class="tb-btn" data-cmd="codeBlock" title="코드 블록">▤</button>
          <span class="tb-sep"></span>
          <button class="tb-btn" data-cmd="bulletList" title="목록">•</button>
          <button class="tb-btn" data-cmd="orderedList" title="번호 목록">1.</button>
          <button class="tb-btn" data-cmd="horizontalRule" title="구분선">―</button>
        </div>
        <div id="note-editor-tiptap" class="note-editor-tiptap"></div>
        <div class="notes-right-actions">
          <button class="btn-add-note btn-note-save-disabled" id="btn-note-save" disabled>저장</button>
          <button class="btn-cancel" id="btn-note-delete">삭제</button>
        </div>
        <div class="note-meta">수정: ${formatDateTime(selected.updated_at)} · 단축키: Ctrl+S 저장</div>
      </section>
    </div>
  `;

  noteOriginal = {
    title: selected.title || '',
    content: editorContent,
    category: selected.category || 'memo',
    pinned: selected.pinned ? 1 : 0,
  };

  initTiptapEditor(editorContent);
  bindNoteToolbar();
  bindNoteDirtyEvents();
}


function migrateNoteContent(raw) {
  if (!raw) return '';
  if (raw.trim().startsWith('<')) return raw;
  return raw.split('\n').map(line => `<p>${escHtml(line) || '<br>'}</p>`).join('');
}

function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || '';
}

function initTiptapEditor(content) {
  if (tiptapEditor) { tiptapEditor.destroy(); tiptapEditor = null; }

  const el = $('#note-editor-tiptap');
  if (!el) return;

  tiptapEditor = new Editor({
    element: el,
    extensions: [
      StarterKit,
      Underline,
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
    ],
    content: content || '<p></p>',
    onUpdate: () => updateNoteDirty(),
  });
}

function bindNoteToolbar() {
  const toolbar = $('#note-toolbar');
  if (!toolbar) return;

  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tb-btn');
    if (!btn || !tiptapEditor) return;
    const cmd = btn.dataset.cmd;
    if (!cmd) return;

    const chain = tiptapEditor.chain().focus();
    switch (cmd) {
      case 'heading':
        chain.toggleHeading({ level: Number(btn.dataset.level) }).run();
        break;
      case 'bold': chain.toggleBold().run(); break;
      case 'italic': chain.toggleItalic().run(); break;
      case 'underline': chain.toggleUnderline().run(); break;
      case 'strike': chain.toggleStrike().run(); break;
      case 'blockquote': chain.toggleBlockquote().run(); break;
      case 'code': chain.toggleCode().run(); break;
      case 'codeBlock': chain.toggleCodeBlock().run(); break;
      case 'bulletList': chain.toggleBulletList().run(); break;
      case 'orderedList': chain.toggleOrderedList().run(); break;
      case 'horizontalRule': chain.setHorizontalRule().run(); break;
      case 'highlight-toggle':
        $('#palette-hl')?.classList.toggle('hidden');
        $('#palette-color')?.classList.add('hidden');
        return;
      case 'color-toggle':
        $('#palette-color')?.classList.toggle('hidden');
        $('#palette-hl')?.classList.add('hidden');
        return;
    }
  });

  toolbar.addEventListener('click', (e) => {
    const hlBtn = e.target.closest('[data-hl]');
    if (hlBtn && tiptapEditor) {
      const color = hlBtn.dataset.hl;
      if (color) tiptapEditor.chain().focus().toggleHighlight({ color }).run();
      else tiptapEditor.chain().focus().unsetHighlight().run();
      $('#palette-hl')?.classList.add('hidden');
      return;
    }

    const colorBtn = e.target.closest('[data-color]');
    if (colorBtn && tiptapEditor) {
      const color = colorBtn.dataset.color;
      tiptapEditor.chain().focus().setColor(color).run();
      const ind = $('#tb-color-ind');
      if (ind) ind.style.background = color;
      $('#palette-color')?.classList.add('hidden');
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.tb-dropdown')) {
      $('#palette-hl')?.classList.add('hidden');
      $('#palette-color')?.classList.add('hidden');
    }
  });
}

function isNoteDirty() {
  if (!noteOriginal) return false;
  const titleEl = $('#note-editor-title');
  const categoryEl = $('#note-editor-category');
  const pinnedEl = $('#note-editor-pinned');
  if (!titleEl || !categoryEl || !pinnedEl) return false;

  const currentContent = tiptapEditor ? tiptapEditor.getHTML() : '';
  return (
    titleEl.value !== noteOriginal.title ||
    currentContent !== (noteOriginal.content || '') ||
    categoryEl.value !== noteOriginal.category ||
    (pinnedEl.checked ? 1 : 0) !== noteOriginal.pinned
  );
}

function updateNoteDirty() {
  const btn = $('#btn-note-save');
  if (!btn) return;
  const dirty = isNoteDirty();
  btn.disabled = !dirty;
  btn.classList.toggle('btn-note-save-disabled', !dirty);
}

function bindNoteDirtyEvents() {
  const titleEl = $('#note-editor-title');
  const categoryEl = $('#note-editor-category');
  const pinnedEl = $('#note-editor-pinned');
  if (!titleEl || !categoryEl || !pinnedEl) return;

  titleEl.addEventListener('input', updateNoteDirty);
  categoryEl.addEventListener('change', updateNoteDirty);
  pinnedEl.addEventListener('change', updateNoteDirty);
}

async function createNoteAndSelect() {
  const note = await window.orbit.createNote({
    title: '새 노트',
    content: null,
    category: 'memo',
    pinned: 0,
    project_id: activeProjectFilter ? activeProjectFilter.id : null,
  });
  selectedNoteId = note.id;
  await renderNotesWithSections(selectedNoteId);
  const titleEl = $('#note-editor-title');
  if (titleEl) {
    titleEl.focus();
    titleEl.select();
  }
}

function getNoteEditorData() {
  const titleEl = $('#note-editor-title');
  const categoryEl = $('#note-editor-category');
  const pinnedEl = $('#note-editor-pinned');
  if (!titleEl || !categoryEl || !pinnedEl) return null;

  const title = titleEl.value.trim();
  if (!title) {
    titleEl.focus();
    return null;
  }

  const content = tiptapEditor ? tiptapEditor.getHTML() : null;
  return {
    title,
    content: content || null,
    category: categoryEl.value || 'memo',
    pinned: pinnedEl.checked ? 1 : 0,
  };
}

async function saveSelectedNote() {
  if (!selectedNoteId) return;
  if (!isNoteDirty()) return;
  const fields = getNoteEditorData();
  if (!fields) return;
  await window.orbit.updateNote(selectedNoteId, fields);
  await renderNotesWithSections(selectedNoteId);
}

async function deleteSelectedNote() {
  if (!selectedNoteId) return;
  const ok = await showConfirmDialog('이 노트를 삭제할까요?');
  if (!ok) return;
  await window.orbit.deleteNote(selectedNoteId);
  selectedNoteId = null;
  await renderNotesWithSections();
}

function noteCategoryOptions(selected) {
  return NOTE_CATEGORIES.map(key => {
    const selectedAttr = key === (selected || 'memo') ? 'selected' : '';
    return `<option value="${key}" ${selectedAttr}>${noteCategoryLabel(key)}</option>`;
  }).join('');
}

function noteCategoryLabel(key) {
  return { idea: '아이디어', memo: '메모', dev: '개발메모' }[key] || key;
}

function updateStatus(count, minutes) {
  const timeStr = minutes > 0 ? ` | 예상 ${formatMinutes(minutes)}` : '';
  $('#status-info').textContent = `남은 작업 ${count}개${timeStr}`;
}

function clearCalendarPlannedCache() {
  calendarPlannedCacheKey = '';
  calendarPlannedCacheData = {};
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmdAsLocalDate(ymd) {
  if (!ymd || typeof ymd !== 'string') return null;
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function getOverdueDays(targetDate) {
  const due = parseYmdAsLocalDate(targetDate);
  if (!due) return 0;
  const now = parseYmdAsLocalDate(todayYmd());
  if (!now) return 0;
  const diff = Math.floor((now.getTime() - due.getTime()) / 86400000);
  return Math.max(0, diff);
}

function shiftDateYmd(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + deltaDays);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function syncDatePicker() {
  const picker = $('#date-picker');
  if (!picker) return;
  picker.value = currentDate;
}

function setSidebarActive(view) {
  $$('.sidebar-item').forEach(el => {
    if (!el.classList.contains('project-item')) el.classList.remove('active');
  });
  // Map internal views to sidebar data-view
  const sidebarView = (view === 'today' || view === 'date') ? 'todo' : view;
  const target = document.querySelector(`.sidebar-item[data-view="${sidebarView}"]`);
  if (target) target.classList.add('active');
}

function renderFilterBadge() {
  let badge = $('#filter-badge');
  if (!activeProjectFilter) {
    if (badge) badge.remove();
    return;
  }
  const title = $('#view-title');
  if (!title) return;
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'filter-badge';
    badge.className = 'filter-badge';
    title.parentNode.insertBefore(badge, title.nextSibling);
  }
  badge.innerHTML = `\u25C6 ${escHtml(activeProjectFilter.name)} <button class="filter-badge-x" id="btn-clear-filter">\u2715</button>`;
}

function clearProjectFilter() {
  activeProjectFilter = null;
  loadProjects();
}

function updateHeaderDateButtons() {
  const prevBtn = $('#btn-date-prev');
  const nextBtn = $('#btn-date-next');
  if (!prevBtn || !nextBtn) return;

  const canNavigate = currentView !== 'project' && currentView !== 'notes' && currentView !== 'schedule';
  prevBtn.classList.toggle('hidden', !canNavigate);
  nextBtn.classList.toggle('hidden', !canNavigate);
}

async function moveHeaderDate(step) {
  if (currentView === 'project' || currentView === 'notes') return;

  if (currentView === 'calendar') {
    calendarMonth += step;
    if (calendarMonth < 1) {
      calendarMonth = 12;
      calendarYear--;
    } else if (calendarMonth > 12) {
      calendarMonth = 1;
      calendarYear++;
    }
    selectedCalDay = null;
    await loadTasks();
    return;
  }

  const baseDate = currentView === 'today' ? todayYmd() : currentDate;
  currentDate = shiftDateYmd(baseDate, step);
  currentView = 'date';
  currentSubTab = 'all';
  setSidebarActive('todo');
  await loadTasks();
}

// ── Events ──

function bindEvents() {
  document.addEventListener('click', async (e) => {
    // Filter badge clear
    if (e.target.closest('#btn-clear-filter')) {
      clearProjectFilter();
      clearCalendarPlannedCache();
      await loadTasks();
      return;
    }

    // Sidebar nav
    const sideItem = e.target.closest('.sidebar-item[data-view]');
    if (sideItem) {
      const view = sideItem.dataset.view;

      // Project click = filter toggle (keep current view)
      if (view === 'project') {
        const projId = Number(sideItem.dataset.projectId);
        if (activeProjectFilter && activeProjectFilter.id === projId) {
          clearProjectFilter();
        } else {
          const projects = await window.orbit.getProjects();
          const proj = projects.find(p => p.id === projId);
          activeProjectFilter = proj ? { id: proj.id, name: proj.name } : null;
          loadProjects();
        }
        clearCalendarPlannedCache();
        await loadTasks();
        return;
      }

      // Tab click = view change
      $$('.sidebar-item').forEach(el => {
        if (!el.classList.contains('project-item')) el.classList.remove('active');
      });
      sideItem.classList.add('active');

      if (view === 'todo') {
        currentView = currentSubTab === 'all' ? 'date' : 'today';
      } else if (view === 'schedule') {
        currentView = 'schedule';
      } else if (view === 'calendar') {
        currentView = 'calendar';
      } else if (view === 'notes') {
        currentView = 'notes';
      } else {
        currentView = 'today';
      }
      await loadTasks();
      return;
    }

    // Sub-tab click (today / all)
    const subTab = e.target.closest('.sub-tab[data-subtab]');
    if (subTab) {
      const tab = subTab.dataset.subtab;
      currentSubTab = tab;
      if (tab === 'today') {
        currentView = 'today';
      } else {
        currentView = 'date';
      }
      setSidebarActive('todo');
      await loadTasks();
      return;
    }

    // Delete project
    const delProj = e.target.closest('.btn-delete-project');
    if (delProj) {
      e.stopPropagation();
      const id = Number(delProj.dataset.id);
      await window.orbit.deleteProject(id);
      await loadProjects();
      if (currentView === 'project' && currentProjectId === id) {
        currentView = 'today';
        await loadTasks();
      }
      return;
    }

    // Expand/collapse subtasks
    const expandBtn = e.target.closest('.btn-expand');
    if (expandBtn) {
      const id = Number(expandBtn.dataset.id);
      if (expandedTasks.has(id)) expandedTasks.delete(id);
      else expandedTasks.add(id);
      await loadTasks();
      return;
    }

    // Add subtask button (expand + focus input)
    const addSubBtn = e.target.closest('.btn-add-sub');
    if (addSubBtn) {
      const id = Number(addSubBtn.dataset.id);
      expandedTasks.add(id);
      await loadTasks();
      setTimeout(() => {
        const input = document.querySelector(`.subtask-input[data-parent="${id}"]`);
        if (input) input.focus();
      }, 50);
      return;
    }

    // Check/uncheck task
    const check = e.target.closest('.task-check');
    if (check) {
      const id = Number(check.dataset.id);
      const isDone = check.classList.contains('checked');
      const newStatus = isDone ? 'pending' : 'done';

      const isSub = check.classList.contains('sub-check');
      if (newStatus === 'done' && !isSub) {
        const card = check.closest('.task-card');
        if (card && card.dataset.hasSubs === '1') {
          const ok = await showConfirmDialog('서브태스크가 포함된 작업입니다.\n완료 목록에 추가하시겠습니까?');
          if (!ok) return;
        }
        await completeTaskWithStopwatch(id, check.closest('.task-card'));
        showUndoToast(id);
      } else if (newStatus === 'done' && isSub) {
        const subItem = check.closest('.subtask-item');
        await completeTaskWithStopwatch(id, subItem);
      } else {
        await window.orbit.updateTask(id, { status: newStatus });
      }
      return;
    }

    // Delete task
    const delTask = e.target.closest('.btn-delete-task');
    if (delTask) {
      const id = Number(delTask.dataset.id);
      await window.orbit.deleteTask(id);
      return;
    }

    const noteListItem = e.target.closest('.note-list-item');
    if (noteListItem) {
      selectedNoteId = Number(noteListItem.dataset.id);
      await renderNotesWithSections(selectedNoteId);
      return;
    }

    const noteNewBtn = e.target.closest('#btn-note-new');
    if (noteNewBtn) {
      await createNoteAndSelect();
      return;
    }

    const noteSaveBtn = e.target.closest('#btn-note-save');
    if (noteSaveBtn) {
      await saveSelectedNote();
      return;
    }

    const noteDeleteBtn = e.target.closest('#btn-note-delete');
    if (noteDeleteBtn) {
      await deleteSelectedNote();
      return;
    }
  });

  // Subtask input (Enter to add)
  document.addEventListener('keydown', async (e) => {
    if (currentView === 'notes' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      await saveSelectedNote();
      return;
    }

    if (e.target.id === 'note-editor-title' && e.key === 'Enter') {
      e.preventDefault();
      await saveSelectedNote();
      return;
    }

    const input = e.target.closest('.subtask-input');
    if (input && e.key === 'Enter') {
      const title = input.value.trim();
      if (!title) return;
      const parentId = Number(input.dataset.parent);
      await window.orbit.createTask({ parent_id: parentId, title });
      input.value = '';
    }

    // Inline edit: Enter to save, Escape to cancel
    const editInput = e.target.closest('.inline-edit-input');
    if (editInput) {
      if (e.key === 'Enter') {
        const id = Number(editInput.dataset.id);
        const newTitle = editInput.value.trim();
        if (newTitle) await window.orbit.updateTask(id, { title: newTitle });
        else await loadTasks();
      }
      if (e.key === 'Escape') await loadTasks();
    }
  });

  // Double-click subtask title to edit inline
  document.addEventListener('dblclick', (e) => {
    const titleEl = e.target.closest('.editable-title');
    if (!titleEl) return;
    const id = titleEl.dataset.id;
    const currentText = titleEl.textContent;
    titleEl.outerHTML = `<input type="text" class="inline-edit-input" data-id="${id}" value="${currentText}" />`;
    const input = document.querySelector(`.inline-edit-input[data-id="${id}"]`);
    if (input) { input.focus(); input.select(); }
  });

  // Inline edit: save on blur
  document.addEventListener('focusout', async (e) => {
    const editInput = e.target.closest('.inline-edit-input');
    if (editInput) {
      const id = Number(editInput.dataset.id);
      const newTitle = editInput.value.trim();
      if (newTitle) await window.orbit.updateTask(id, { title: newTitle });
      else await loadTasks();
    }

    // TipTap handles its own focus events
  });

  // Subtask estimate change
  document.addEventListener('change', async (e) => {
    const estInput = e.target.closest('.subtask-est-input');
    if (estInput) {
      const id = Number(estInput.dataset.id);
      const minutes = Number(estInput.value) || null;
      await window.orbit.updateTask(id, { estimate_minutes: minutes });
    }
  });

  // Add main task
  $('#btn-add-task').addEventListener('click', addTask);
  $('#new-task-title').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTask();
  });

  // Add schedule
  $('#btn-add-schedule').addEventListener('click', addSchedule);
  $('#new-schedule-title').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addSchedule();
  });

  // Recurrence type toggle
  $('#new-schedule-recurrence').addEventListener('change', (e) => {
    const row = $('#recurrence-days-row');
    if (e.target.value === 'weekly') row.classList.remove('hidden');
    else row.classList.add('hidden');
  });

  // Day buttons toggle
  document.querySelectorAll('#recurrence-days-row .day-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      btn.classList.toggle('active');
    });
  });

  // Time input auto-format
  document.querySelectorAll('.time-input-custom').forEach(el => {
    el.addEventListener('blur', () => {
      const formatted = formatTimeInput(el.value);
      if (formatted) el.value = formatted;
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const formatted = formatTimeInput(el.value);
        if (formatted) el.value = formatted;
        // Tab to next input or submit
        const next = el.nextElementSibling;
        if (next && next.tagName === 'SPAN') {
          const nextInput = next.nextElementSibling;
          if (nextInput) nextInput.focus();
        } else {
          addSchedule();
        }
      }
    });
  });

  // Date picker
  $('#date-picker').addEventListener('change', async (e) => {
    currentDate = e.target.value;
    if (currentView === 'schedule') {
      await renderSchedule(currentDate);
    } else {
      currentView = 'date';
      currentSubTab = 'all';
      setSidebarActive('todo');
      await loadTasks();
    }
  });

  $('#btn-date-prev').addEventListener('click', async () => {
    await moveHeaderDate(-1);
  });

  $('#btn-date-next').addEventListener('click', async () => {
    await moveHeaderDate(1);
  });

  // Project modal
  $('#btn-add-project').addEventListener('click', () => {
    $('#project-modal').classList.remove('hidden');
    $('#project-name').focus();
  });

  $('#btn-cancel-project').addEventListener('click', () => {
    $('#project-modal').classList.add('hidden');
    clearProjectModal();
  });

  $('#btn-confirm-project').addEventListener('click', async () => {
    const name = $('#project-name').value.trim();
    if (!name) return;
    await window.orbit.createProject({
      name,
      folder_path: $('#project-path').value.trim() || undefined,
      tech_stack: $('#project-tech').value.trim() || undefined,
    });
    $('#project-modal').classList.add('hidden');
    clearProjectModal();
    await loadProjects();
  });

  $('#project-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#btn-confirm-project').click();
    if (e.key === 'Escape') $('#btn-cancel-project').click();
  });

  // Right-click context menu
  const ctxMenu = document.createElement('div');
  ctxMenu.id = 'main-ctx-menu';
  ctxMenu.className = 'main-ctx-menu hidden';
  document.body.appendChild(ctxMenu);

  document.addEventListener('contextmenu', (e) => {
    const subItem = e.target.closest('.subtask-item');
    const card = e.target.closest('.task-card');
    if (!card && !subItem) { ctxMenu.classList.add('hidden'); return; }
    e.preventDefault();

    let id, hasSubs, swStarted, swElapsed, swSource;
    if (subItem) {
      id = Number(subItem.dataset.id);
      hasSubs = false;
      swStarted = subItem.dataset.swStarted;
      swElapsed = Number(subItem.dataset.swElapsed) || 0;
      swSource = subItem;
    } else {
      id = Number(card.dataset.id);
      hasSubs = card.dataset.hasSubs === '1';
      swStarted = card.dataset.swStarted;
      swElapsed = Number(card.dataset.swElapsed) || 0;
      swSource = card;
    }

    const isRunning = !!swStarted;
    const isPaused = !isRunning && swElapsed > 0;

    let swItems = '';
    if (isRunning) {
      swItems = `
        <button class="mctx-item mctx-sw-pause" data-id="${id}">&#9208; 일시정지</button>
        <button class="mctx-item mctx-sw-stop" data-id="${id}">&#9209; 중지</button>
      `;
    } else if (isPaused) {
      swItems = `
        <button class="mctx-item mctx-sw-resume" data-id="${id}">&#9654; 스톱워치 재개</button>
        <button class="mctx-item mctx-sw-stop" data-id="${id}">&#9209; 중지</button>
      `;
    } else {
      swItems = `<button class="mctx-item mctx-sw-start" data-id="${id}">&#9201; 스톱워치 시작</button>`;
    }

    ctxMenu.innerHTML = `
      <button class="mctx-item mctx-focus" data-id="${id}">&#9654; 작업 시작</button>
      ${swItems}
      <div class="mctx-divider"></div>
      <button class="mctx-item mctx-complete" data-id="${id}">&#10003; 완료</button>
      <button class="mctx-item mctx-delete" data-id="${id}">&#10005; 삭제</button>
    `;
    ctxMenu.classList.remove('hidden');

    const x = Math.min(e.clientX, window.innerWidth - 160);
    const y = Math.min(e.clientY, window.innerHeight - 140);
    ctxMenu.style.left = `${x}px`;
    ctxMenu.style.top = `${y}px`;

    ctxMenu.querySelector('.mctx-focus').addEventListener('click', async () => {
      ctxMenu.classList.add('hidden');
      if (!isRunning) await startTaskTimer(id);
    });

    ctxMenu.querySelector('.mctx-complete').addEventListener('click', async () => {
      ctxMenu.classList.add('hidden');
      if (hasSubs) {
        const ok = await showConfirmDialog('서브태스크가 포함된 작업입니다.\n완료 목록에 추가하시겠습니까?');
        if (!ok) return;
      }
      if (subItem) {
        await completeTaskWithStopwatch(id, swSource);
      } else {
        await completeTaskWithStopwatch(id, swSource);
        showUndoToast(id);
      }
    });

    ctxMenu.querySelector('.mctx-delete').addEventListener('click', async () => {
      await window.orbit.deleteTask(id);
      ctxMenu.classList.add('hidden');
    });

    bindMainStopwatchCtx(ctxMenu, id, swSource);
  });

  document.addEventListener('click', () => {
    ctxMenu.classList.add('hidden');
  });
}

async function addTask() {
  const titleEl = $('#new-task-title');
  const title = titleEl.value.trim();
  if (!title) return;

  const data = {
    title,
    priority: $('#new-task-priority').value,
    estimate_minutes: Number($('#new-task-estimate').value) || undefined,
    target_date: currentView === 'date' ? currentDate : undefined,
  };

  if (currentView === 'project' && currentProjectId) {
    data.project_id = currentProjectId;
  }

  if (activeProjectFilter) {
    data.project_id = activeProjectFilter.id;
  }

  await window.orbit.createTask(data);
  titleEl.value = '';
  $('#new-task-estimate').value = '';
  $('#new-task-priority').value = 'normal';
  titleEl.focus();
}

function formatTimeInput(raw) {
  if (!raw) return '';
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length === 0) return '';
  let hh, mm;
  if (digits.length <= 2) {
    hh = digits.padStart(2, '0');
    mm = '00';
  } else if (digits.length === 3) {
    hh = '0' + digits[0];
    mm = digits.slice(1);
  } else {
    hh = digits.slice(0, 2);
    mm = digits.slice(2, 4);
  }
  hh = String(Math.min(23, Number(hh))).padStart(2, '0');
  mm = String(Math.min(59, Number(mm))).padStart(2, '0');
  return `${hh}:${mm}`;
}

async function addSchedule() {
  const titleEl = $('#new-schedule-title');
  const startEl = $('#new-schedule-start');
  const endEl = $('#new-schedule-end');
  const recurrenceEl = $('#new-schedule-recurrence');
  const title = titleEl.value.trim();
  const start = formatTimeInput(startEl.value);
  const end = formatTimeInput(endEl.value);
  if (!title || !start || !end) return;

  startEl.value = start;
  endEl.value = end;

  const recurrenceType = recurrenceEl.value;
  let recurrenceDays = null;
  if (recurrenceType === 'weekly') {
    const selected = [...document.querySelectorAll('#recurrence-days-row .day-btn.active')]
      .map(b => b.dataset.day);
    if (selected.length === 0) return; // 요일 미선택 시 무시
    recurrenceDays = selected.join(',');
  }

  const dateEl = $('#new-schedule-date');
  const schedDate = dateEl.value || currentDate;

  await window.orbit.createSchedule({
    title,
    date: schedDate,
    start_time: start,
    end_time: end,
    project_id: activeProjectFilter ? activeProjectFilter.id : null,
    recurrence_type: recurrenceType,
    recurrence_days: recurrenceDays,
  });
  titleEl.value = '';
  startEl.value = '';
  endEl.value = '';
  recurrenceEl.value = 'none';
  $('#recurrence-days-row').classList.add('hidden');
  document.querySelectorAll('#recurrence-days-row .day-btn').forEach(b => b.classList.remove('active'));
  titleEl.focus();
  await renderSchedule(currentDate);
}

async function renderSchedule(date) {
  const container = $('#schedule-view');
  const pid = activeProjectFilter ? activeProjectFilter.id : undefined;
  const schedules = await window.orbit.getSchedules(date, pid);

  const alarmType = localStorage.getItem('alarm-source-type') || 'file';
  const soundPath = localStorage.getItem('alarm-sound-path');
  const ytUrl = localStorage.getItem('alarm-youtube-url');
  let sourceLabel = '설정 안 됨';
  if (alarmType === 'file' && soundPath) sourceLabel = '🎵 ' + soundPath.split(/[\\/]/).pop();
  else if (alarmType === 'youtube' && ytUrl) sourceLabel = '▶ YouTube';

  // 날짜 파싱
  const dateObj = new Date(date + 'T00:00:00');
  const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const isToday = date === todayYmd();
  const dayLabel = isToday ? '오늘' : dayNames[dateObj.getDay()];
  const monthDay = `${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일`;

  let headerHtml = `
    <div class="schedule-date-nav">
      <button class="schedule-nav-btn" id="sched-prev">◀</button>
      <div class="schedule-date-display">
        <span class="schedule-date-day ${isToday ? 'today' : ''}">${dayLabel}</span>
        <span class="schedule-date-full">${dateObj.getFullYear()}년 ${monthDay}</span>
      </div>
      <button class="schedule-nav-btn" id="sched-next">▶</button>
      <button class="schedule-nav-today ${isToday ? 'hidden' : ''}" id="sched-today">오늘</button>
    </div>
    <div class="schedule-header-bar">
      <button class="schedule-sound-btn" id="btn-open-alarm-settings" title="알람 설정">
        ⚙ <span class="sound-label">${escHtml(sourceLabel)}</span>
      </button>
    </div>
  `;

  if (!schedules || schedules.length === 0) {
    container.innerHTML = headerHtml + '<div class="empty-state">스케줄이 없습니다</div>';
    bindScheduleNav(date);
    bindAlarmSettingsBtn();
    return;
  }

  const totalMinutes = schedules.reduce((sum, s) => {
    if (!s.start_time || !s.end_time) return sum;
    const [sh, sm] = s.start_time.split(':').map(Number);
    const [eh, em] = s.end_time.split(':').map(Number);
    return sum + (eh * 60 + em) - (sh * 60 + sm);
  }, 0);
  const totalH = Math.floor(totalMinutes / 60);
  const totalM = totalMinutes % 60;
  const totalLabel = totalH > 0 ? (totalM > 0 ? `${totalH}시간 ${totalM}분` : `${totalH}시간`) : `${totalM}분`;

  let workTimeHtml = '';
  try {
    if (window.orbit.workTotalByDate) {
      const workSec = await window.orbit.workTotalByDate(date);
      if (workSec > 0) {
        const wH = Math.floor(workSec / 3600);
        const wM = Math.floor((workSec % 3600) / 60);
        const wLabel = wH > 0 ? (wM > 0 ? `${wH}시간 ${wM}분` : `${wH}시간`) : `${wM}분`;
        workTimeHtml = ` · 실제 작업: <strong>${wLabel}</strong>`;
      }
    }
  } catch {}
  const totalTimeHtml = `<div class="schedule-total-time">할당 시간: <strong>${totalLabel}</strong>${workTimeHtml}</div>`;

  container.innerHTML = headerHtml + totalTimeHtml + schedules.map(s => {
    const alarmOn = s.alarm_enabled ? 1 : 0;
    return `
    <div class="schedule-card" data-id="${s.id}">
      <div class="schedule-time">
        <span class="schedule-start">${s.start_time.slice(0, 5)}</span>
        <span class="schedule-dash">—</span>
        <span class="schedule-end">${s.end_time.slice(0, 5)}</span>
      </div>
      <div class="schedule-body">
        <span class="schedule-title">${escHtml(s.title)}${s.is_recurring || (s.recurrence_type && s.recurrence_type !== 'none') ? ' <span class="recurrence-badge" title="반복 스케줄">🔄</span>' : ''}</span>
        ${s.description ? `<span class="schedule-desc">${escHtml(s.description)}</span>` : ''}
        ${s.project_name ? `<span class="task-project">${escHtml(s.project_name)}</span>` : ''}
        ${s.recurrence_type === 'daily' ? '<span class="recurrence-info">매일</span>' : ''}
        ${s.recurrence_type === 'weekly' && s.recurrence_days ? `<span class="recurrence-info">매주 ${s.recurrence_days.split(',').map(d => ['일', '월', '화', '수', '목', '금', '토'][Number(d)]).join(',')}</span>` : ''}
      </div>
      <button class="btn-alarm-toggle ${alarmOn ? 'alarm-on' : ''}" data-id="${s.id}" data-alarm="${alarmOn}" title="알람 ${alarmOn ? 'ON' : 'OFF'}">
        ${alarmOn ? '🔔' : '🔕'}
      </button>
      <button class="btn-task-action btn-delete-schedule" data-id="${s.id}" title="삭제">&times;</button>
    </div>
  `}).join('');

  bindScheduleNav(date);
  bindAlarmSettingsBtn();

  container.querySelectorAll('.btn-alarm-toggle').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      const newVal = btn.dataset.alarm === '1' ? 0 : 1;
      await window.orbit.updateSchedule(id, { alarm_enabled: newVal });
      await renderSchedule(date);
    });
  });

  container.querySelectorAll('.btn-delete-schedule').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.orbit.deleteSchedule(Number(btn.dataset.id));
      await renderSchedule(date);
    });
  });

  // Click card to edit
  container.querySelectorAll('.schedule-card').forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-alarm-toggle') || e.target.closest('.btn-delete-schedule')) return;
      const id = Number(card.dataset.id);
      const s = schedules.find(x => x.id === id);
      if (s) showScheduleEditModal(s, date);
    });
  });
}

function bindScheduleNav(date) {
  const prev = document.getElementById('sched-prev');
  const next = document.getElementById('sched-next');
  const todayBtn = document.getElementById('sched-today');
  if (prev) prev.addEventListener('click', async () => {
    currentDate = shiftDateYmd(currentDate, -1);
    syncDatePicker();
    await renderSchedule(currentDate);
  });
  if (next) next.addEventListener('click', async () => {
    currentDate = shiftDateYmd(currentDate, 1);
    syncDatePicker();
    await renderSchedule(currentDate);
  });
  if (todayBtn) todayBtn.addEventListener('click', async () => {
    currentDate = todayYmd();
    syncDatePicker();
    await renderSchedule(currentDate);
  });
}

// ── Schedule edit modal ──

function showScheduleEditModal(schedule, date) {
  let overlay = document.getElementById('schedule-edit-overlay');
  if (overlay) overlay.remove();

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const recType = schedule.recurrence_type || 'none';
  const recDays = schedule.recurrence_days ? schedule.recurrence_days.split(',').map(Number) : [];

  overlay = document.createElement('div');
  overlay.id = 'schedule-edit-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal schedule-edit-modal">
      <h3>📝 스케줄 수정</h3>

      <div class="alarm-field">
        <label class="alarm-label">제목</label>
        <input type="text" class="modal-input" id="edit-sched-title" value="${escHtml(schedule.title)}" />
      </div>

      <div class="alarm-field">
        <label class="alarm-label">날짜</label>
        <input type="date" class="modal-input" id="edit-sched-date" value="${schedule.date}" />
      </div>

      <div class="alarm-field">
        <label class="alarm-label">시간</label>
        <div class="edit-sched-time-row">
          <input type="text" class="time-input-custom" id="edit-sched-start" value="${schedule.start_time.slice(0, 5)}" maxlength="5" />
          <span class="time-separator">~</span>
          <input type="text" class="time-input-custom" id="edit-sched-end" value="${schedule.end_time.slice(0, 5)}" maxlength="5" />
        </div>
      </div>

      <div class="alarm-field">
        <label class="alarm-label">메모</label>
        <input type="text" class="modal-input" id="edit-sched-desc" value="${escHtml(schedule.description || '')}" placeholder="선택 사항" />
      </div>

      <div class="alarm-field">
        <label class="alarm-label">반복</label>
        <select class="modal-input" id="edit-sched-recurrence" style="width:auto">
          <option value="none" ${recType === 'none' ? 'selected' : ''}>반복 안 함</option>
          <option value="daily" ${recType === 'daily' ? 'selected' : ''}>매일</option>
          <option value="weekly" ${recType === 'weekly' ? 'selected' : ''}>매주</option>
        </select>
      </div>

      <div class="alarm-field edit-sched-days-row ${recType !== 'weekly' ? 'hidden' : ''}" id="edit-sched-days-row">
        <label class="alarm-label">반복 요일</label>
        <div class="recurrence-days-row">
          ${dayNames.map((name, i) => `<button class="day-btn ${recDays.includes(i) ? 'active' : ''}" data-day="${i}">${name}</button>`).join('')}
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn-cancel" id="btn-edit-sched-cancel">취소</button>
        <button class="btn-add-task" id="btn-edit-sched-save">저장</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Recurrence type toggle
  overlay.querySelector('#edit-sched-recurrence').addEventListener('change', (e) => {
    const row = overlay.querySelector('#edit-sched-days-row');
    if (e.target.value === 'weekly') row.classList.remove('hidden');
    else row.classList.add('hidden');
  });

  // Day buttons toggle
  overlay.querySelectorAll('#edit-sched-days-row .day-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      btn.classList.toggle('active');
    });
  });

  // Time input auto-format on blur
  overlay.querySelectorAll('.time-input-custom').forEach(el => {
    el.addEventListener('blur', () => {
      const formatted = formatTimeInput(el.value);
      if (formatted) el.value = formatted;
    });
  });

  // Cancel
  overlay.querySelector('#btn-edit-sched-cancel').addEventListener('click', () => overlay.remove());

  // Save
  overlay.querySelector('#btn-edit-sched-save').addEventListener('click', async () => {
    const title = overlay.querySelector('#edit-sched-title').value.trim();
    const startRaw = overlay.querySelector('#edit-sched-start').value;
    const endRaw = overlay.querySelector('#edit-sched-end').value;
    const start = formatTimeInput(startRaw);
    const end = formatTimeInput(endRaw);
    if (!title || !start || !end) return;

    const recurrenceType = overlay.querySelector('#edit-sched-recurrence').value;
    let recurrenceDays = null;
    if (recurrenceType === 'weekly') {
      const selected = [...overlay.querySelectorAll('#edit-sched-days-row .day-btn.active')]
        .map(b => b.dataset.day);
      if (selected.length === 0) return;
      recurrenceDays = selected.join(',');
    }

    await window.orbit.updateSchedule(schedule.id, {
      title,
      date: overlay.querySelector('#edit-sched-date').value,
      start_time: start,
      end_time: end,
      description: overlay.querySelector('#edit-sched-desc').value.trim() || null,
      recurrence_type: recurrenceType,
      recurrence_days: recurrenceDays,
    });
    overlay.remove();
    await renderSchedule(date);
  });

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Focus title
  overlay.querySelector('#edit-sched-title').focus();
}

// ── Alarm settings modal ──

function bindAlarmSettingsBtn() {
  const btn = $('#btn-open-alarm-settings');
  if (!btn) return;
  btn.addEventListener('click', () => showAlarmSettingsModal());
}

function showAlarmSettingsModal() {
  let overlay = document.getElementById('alarm-settings-overlay');
  if (overlay) overlay.remove();

  const srcType = localStorage.getItem('alarm-source-type') || 'file';
  const filePath = localStorage.getItem('alarm-sound-path') || '';
  const ytUrl = localStorage.getItem('alarm-youtube-url') || '';
  const duration = localStorage.getItem('alarm-duration') || '30';
  const repeatCount = localStorage.getItem('alarm-repeat') || '1';
  const fileName = filePath ? filePath.split(/[\\/]/).pop() : '선택 안 됨';

  overlay = document.createElement('div');
  overlay.id = 'alarm-settings-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal alarm-settings-modal">
      <h3>⚙ 알람 설정</h3>

      <div class="alarm-field">
        <label class="alarm-label">소스</label>
        <div class="alarm-radio-group">
          <label class="alarm-radio"><input type="radio" name="alarm-src" value="file" ${srcType === 'file' ? 'checked' : ''} /> 파일</label>
          <label class="alarm-radio"><input type="radio" name="alarm-src" value="youtube" ${srcType === 'youtube' ? 'checked' : ''} /> YouTube</label>
        </div>
      </div>

      <div class="alarm-field alarm-file-section" ${srcType === 'youtube' ? 'style="display:none"' : ''}>
        <label class="alarm-label">사운드 파일</label>
        <div class="alarm-file-row">
          <span class="alarm-file-name" id="alarm-file-name">${escHtml(fileName)}</span>
          <button class="btn-add-task" id="btn-pick-alarm-file" style="padding:8px 14px;font-size:12px;">선택</button>
        </div>
      </div>

      <div class="alarm-field alarm-yt-section" ${srcType === 'file' ? 'style="display:none"' : ''}>
        <label class="alarm-label">YouTube URL</label>
        <input type="text" class="modal-input" id="alarm-yt-url" value="${escHtml(ytUrl)}" placeholder="https://www.youtube.com/watch?v=..." />
      </div>

      <div class="alarm-field">
        <label class="alarm-label">재생 시간 (초)</label>
        <input type="number" class="modal-input" id="alarm-duration" value="${duration}" min="5" max="300" style="width:100px" />
      </div>

      <div class="alarm-field">
        <label class="alarm-label">반복 횟수 (5분 간격)</label>
        <input type="number" class="modal-input" id="alarm-repeat" value="${repeatCount}" min="1" max="10" style="width:100px" />
      </div>

      <div class="modal-actions">
        <button class="btn-cancel" id="btn-alarm-cancel">취소</button>
        <button class="btn-add-task" id="btn-alarm-save">저장</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Toggle file/youtube sections
  overlay.querySelectorAll('input[name="alarm-src"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isFile = radio.value === 'file';
      overlay.querySelector('.alarm-file-section').style.display = isFile ? '' : 'none';
      overlay.querySelector('.alarm-yt-section').style.display = isFile ? 'none' : '';
    });
  });

  // Pick file
  overlay.querySelector('#btn-pick-alarm-file').addEventListener('click', async () => {
    const fp = await window.orbit.selectAlarmSound();
    if (fp) {
      localStorage.setItem('alarm-sound-path', fp);
      overlay.querySelector('#alarm-file-name').textContent = fp.split(/[\\/]/).pop();
    }
  });

  // Cancel
  overlay.querySelector('#btn-alarm-cancel').addEventListener('click', () => overlay.remove());

  // Save
  overlay.querySelector('#btn-alarm-save').addEventListener('click', () => {
    const selectedSrc = overlay.querySelector('input[name="alarm-src"]:checked').value;
    localStorage.setItem('alarm-source-type', selectedSrc);
    localStorage.setItem('alarm-youtube-url', overlay.querySelector('#alarm-yt-url').value.trim());
    localStorage.setItem('alarm-duration', overlay.querySelector('#alarm-duration').value || '30');
    localStorage.setItem('alarm-repeat', overlay.querySelector('#alarm-repeat').value || '1');
    overlay.remove();
    if (currentView === 'schedule') renderSchedule(currentDate);
  });

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// ── Alarm timer ──

let alarmAudio = null;
let lastAlarmMinute = '';
let alarmRepeatTimers = [];

function stopAlarmSound() {
  if (alarmAudio) { alarmAudio.pause(); alarmAudio = null; }
  window.orbit.stopYoutubeAlarm();
  alarmRepeatTimers.forEach(t => clearTimeout(t));
  alarmRepeatTimers = [];
}

function playAlarmSound() {
  const srcType = localStorage.getItem('alarm-source-type') || 'file';
  const durationSec = Number(localStorage.getItem('alarm-duration')) || 30;

  if (srcType === 'youtube') {
    const ytUrl = localStorage.getItem('alarm-youtube-url');
    if (ytUrl) {
      window.orbit.playYoutubeAlarm(ytUrl);
      // Auto-stop after duration
      const t = setTimeout(() => window.orbit.stopYoutubeAlarm(), durationSec * 1000);
      alarmRepeatTimers.push(t);
    }
  } else {
    const soundPath = localStorage.getItem('alarm-sound-path');
    if (soundPath) {
      try {
        if (alarmAudio) { alarmAudio.pause(); alarmAudio = null; }
        alarmAudio = new Audio(`file://${soundPath.replace(/\\/g, '/')}`);
        alarmAudio.volume = 0.7;
        alarmAudio.play().catch(() => { });
        // Auto-stop after duration
        const t = setTimeout(() => {
          if (alarmAudio) { alarmAudio.pause(); alarmAudio = null; }
        }, durationSec * 1000);
        alarmRepeatTimers.push(t);
      } catch (_) { }
    }
  }
}

setInterval(async () => {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const currentMinute = `${hh}:${mm}`;
  const today = todayYmd();

  if (currentMinute === lastAlarmMinute) return;

  const schedules = await window.orbit.getSchedules(today);
  const matched = (schedules || []).filter(s =>
    s.alarm_enabled && s.start_time && s.start_time.slice(0, 5) === currentMinute
  );

  if (matched.length === 0) return;
  lastAlarmMinute = currentMinute;

  const repeatCount = Number(localStorage.getItem('alarm-repeat')) || 1;
  const titles = matched.map(s => s.title).join(', ');

  // First alarm
  playAlarmSound();
  showAlarmToast(`🔔 ${currentMinute} — ${titles}`);

  // Repeat alarms (every 5 minutes)
  for (let i = 1; i < repeatCount; i++) {
    const t = setTimeout(() => {
      playAlarmSound();
      showAlarmToast(`🔔 반복 ${i + 1}/${repeatCount} — ${titles}`);
    }, i * 5 * 60 * 1000);
    alarmRepeatTimers.push(t);
  }
}, 15000);

function showAlarmToast(message) {
  let toast = document.getElementById('alarm-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'alarm-toast';
    toast.className = 'alarm-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.remove('hidden');
  toast.classList.add('show');

  const durationSec = Number(localStorage.getItem('alarm-duration')) || 30;
  setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hidden');
  }, (durationSec + 2) * 1000);

  toast.addEventListener('click', () => {
    toast.classList.remove('show');
    toast.classList.add('hidden');
    stopAlarmSound();
  }, { once: true });
}

function clearProjectModal() {
  $('#project-name').value = '';
  $('#project-path').value = '';
  $('#project-tech').value = '';
}

// ── Confirm Dialog ──

function showConfirmDialog(message) {
  return new Promise((resolve) => {
    let overlay = document.getElementById('confirm-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'confirm-overlay';
      overlay.className = 'confirm-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="confirm-box">
        <div class="confirm-msg">${message.replace(/\n/g, '<br>')}</div>
        <div class="confirm-btns">
          <button class="confirm-cancel">취소</button>
          <button class="confirm-ok">확인</button>
        </div>
      </div>
    `;
    overlay.classList.add('show');
    overlay.querySelector('.confirm-ok').addEventListener('click', () => {
      overlay.classList.remove('show');
      resolve(true);
    });
    overlay.querySelector('.confirm-cancel').addEventListener('click', () => {
      overlay.classList.remove('show');
      resolve(false);
    });
  });
}

// ── Undo Toast ──

let undoTimer = null;

function showUndoToast(taskId) {
  clearTimeout(undoTimer);
  let toast = document.getElementById('undo-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'undo-toast';
    toast.className = 'undo-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `작업 완료! <button class="undo-btn" id="btn-undo">되돌리기</button>`;
  toast.classList.add('show');

  const undoBtn = document.getElementById('btn-undo');
  undoBtn.addEventListener('click', async () => {
    await window.orbit.updateTask(taskId, { status: 'pending' });
    toast.classList.remove('show');
    clearTimeout(undoTimer);
  });

  undoTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 5000);
}

// ── Calendar ──

let selectedCalDay = null;

function monthDateStrings(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  const dates = [];
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(`${year}-${mm}-${String(d).padStart(2, '0')}`);
  }
  return dates;
}

async function getPlannedByDayForMonth(year, month) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  if (calendarPlannedCacheKey === key) return calendarPlannedCacheData;

  const dates = monthDateStrings(year, month);
  const pid = activeProjectFilter ? activeProjectFilter.id : undefined;
  const results = await Promise.all(dates.map(async (dateStr) => {
    const dayTasks = await window.orbit.getTasksByDate(dateStr, pid);
    return [dateStr, (dayTasks || []).filter(t => t.status === 'pending')];
  }));

  const byDay = {};
  for (const [dateStr, tasks] of results) {
    byDay[dateStr] = tasks;
  }

  calendarPlannedCacheKey = key;
  calendarPlannedCacheData = byDay;
  return byDay;
}

async function renderCalendar() {
  const container = $('#calendar-view');
  const pid = activeProjectFilter ? activeProjectFilter.id : undefined;
  const [completed, plannedByDay, effortData, schedules, workMonthData] = await Promise.all([
    window.orbit.getCompletedByMonth(calendarYear, calendarMonth, pid),
    getPlannedByDayForMonth(calendarYear, calendarMonth),
    (window.orbit.getEffortCalendar ? window.orbit.getEffortCalendar(calendarYear, calendarMonth) : Promise.resolve([])).catch(() => []),
    (window.orbit.getSchedulesByMonth ? window.orbit.getSchedulesByMonth(calendarYear, calendarMonth) : Promise.resolve([])).catch(() => []),
    (window.orbit.workTotalByMonth ? window.orbit.workTotalByMonth(calendarYear, calendarMonth) : Promise.resolve([])).catch(() => []),
  ]);

  const workByDay = {};
  for (const w of workMonthData) { workByDay[w.date] = w.total; }

  const effortByDay = {};
  let effortSum = 0;
  for (const e of effortData) { effortByDay[e.date] = e.score; effortSum += e.score; }
  const effortAvg = effortData.length > 0 ? effortSum / effortData.length : 0;

  const schedByDay = {};
  for (const s of schedules) {
    if (!schedByDay[s.date]) schedByDay[s.date] = [];
    schedByDay[s.date].push(s);
  }

  const byDay = {};
  for (const t of completed) {
    const day = t.completed_at ? t.completed_at.slice(0, 10) : null;
    if (!day) continue;
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(t);
  }

  const groupByDay = {};
  for (const [day, tasks] of Object.entries(byDay)) {
    const parents = tasks.filter(t => !t.parent_id);
    const children = tasks.filter(t => t.parent_id);
    const grouped = parents.map(p => ({
      ...p,
      subs: children.filter(c => c.parent_id === p.id)
    }));
    const orphanSubs = children.filter(c => !parents.some(p => p.id === c.parent_id));
    groupByDay[day] = [...grouped, ...orphanSubs.map(s => ({ ...s, subs: [] }))];
  }

  const firstDay = new Date(calendarYear, calendarMonth - 1, 1);
  const startDow = firstDay.getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth, 0).getDate();
  const today = todayYmd();

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  let html = `
    <div class="cal-nav">
      <button class="cal-nav-btn" id="cal-prev">&#9664;</button>
      <span class="cal-nav-title">${calendarYear}년 ${calendarMonth}월</span>
      <button class="cal-nav-btn" id="cal-next">&#9654;</button>
    </div>
    <div class="cal-grid">
      ${dayNames.map(d => `<div class="cal-header">${d}</div>`).join('')}
  `;

  for (let i = 0; i < startDow; i++) {
    html += '<div class="cal-cell cal-empty"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const doneItems = groupByDay[dateStr] || [];
    const plannedItems = plannedByDay[dateStr] || [];
    const previewItems = [
      ...doneItems.map(t => ({
        kind: 'done',
        title: t.title,
        subCount: (t.subs && t.subs.length) || 0,
      })),
      ...plannedItems.map(t => ({
        kind: 'plan',
        title: t.title,
        subCount: (t.subtasks && t.subtasks.length) || 0,
      })),
    ];
    const dayScheds = schedByDay[dateStr] || [];
    const hasWork = previewItems.length > 0 || dayScheds.length > 0;
    const isToday = dateStr === today;
    const schedBadge = dayScheds.length > 0 ? `<span class="cal-sched-badge" title="스케줄 ${dayScheds.length}개">📅</span>` : '';

    const tasksHtml = previewItems.slice(0, 3).map(item => {
      const hasSubs = item.subCount > 0;
      const badgeLabel = item.kind === 'done' ? '완료' : '예정';
      return `<div class="cal-task ${item.kind}" title="[${badgeLabel}] ${escHtml(item.title)}${hasSubs ? ' (+' + item.subCount + ')' : ''}">${escHtml(item.title)}${hasSubs ? ' <span class="cal-task-count">+' + item.subCount + '</span>' : ''}</div>`;
    }).join('');
    const moreHtml = previewItems.length > 3 ? `<div class="cal-more">+${previewItems.length - 3}</div>` : '';

    const isSelected = dateStr === selectedCalDay;
    const dayEffort = effortByDay[dateStr] || 0;
    const fireHtml = (dayEffort > 0 && dayEffort >= effortAvg) ? '<span class="cal-day-fire">🔥</span>' : '';
    html += `
      <div class="cal-cell${isToday ? ' cal-today' : ''}${hasWork ? ' cal-active' : ''}${isSelected ? ' cal-selected' : ''}" data-date="${dateStr}">
        <span class="cal-day">${d}</span>${fireHtml}${schedBadge}
        <div class="cal-tasks">${tasksHtml}${moreHtml}</div>
      </div>
    `;
  }

  html += '</div>';

  const totalCompleted = completed.length;
  const activeDays = Object.keys(byDay).length;
  const totalPlanned = Object.values(plannedByDay).reduce((acc, items) => acc + items.length, 0);
  const plannedDays = Object.values(plannedByDay).filter(items => items.length > 0).length;
  const totalScheds = schedules.length;
  html += `<div class="cal-summary">이번 달: 완료 ${totalCompleted}개 · 예정 ${totalPlanned}개 · 스케줄 ${totalScheds}개 · 활동일 ${activeDays}일</div>`;

  // Detail panel for selected day
  if (selectedCalDay) {
    const dateStr = selectedCalDay;
    const dayDoneItems = groupByDay[dateStr] || [];
    const dayPlannedItems = plannedByDay[dateStr] || [];
    const dayLabel = dateStr.slice(5).replace('-', '/');

    let detailHtml = `<div class="cal-detail" data-date="${dateStr}">
      <div class="cal-detail-header">
        <span class="cal-detail-date">${dayLabel} 작업 보기</span>
        <button class="cal-detail-close" data-date="${dateStr}">&times;</button>
      </div>
      <div class="cal-detail-list">`;

    if (dayDoneItems.length === 0 && dayPlannedItems.length === 0 && (schedByDay[dateStr] || []).length === 0) {
      detailHtml += '<div class="cal-detail-empty">기록 없음</div>';
    }

    if (dayDoneItems.length > 0) {
      detailHtml += '<div class="cal-detail-section-title">완료</div>';
      for (const t of dayDoneItems) {
        const timeInfo = [];
        if (t.estimate_minutes) timeInfo.push(`예상 ${formatMinutes(t.estimate_minutes)}`);
        if (t.actual_minutes) timeInfo.push(`실제 ${formatMinutes(t.actual_minutes)}`);

        detailHtml += `<div class="cal-detail-item">
          <span class="cal-detail-check">&#10003;</span>
          <span class="cal-detail-title">${escHtml(t.title)}</span>
          ${timeInfo.length ? `<span class="cal-detail-time">${timeInfo.join(' / ')}</span>` : ''}
          <button class="cal-detail-restore" data-id="${t.id}" title="할 일로 복원">&#8634;</button>
        </div>`;
        detailHtml += `<div class="cal-detail-memo" data-id="${t.id}">
          <span class="cal-memo-text ${t.description ? '' : 'placeholder'}" data-id="${t.id}">${t.description ? escHtml(t.description) : '메모 추가...'}</span>
        </div>`;
        if (t.subs && t.subs.length > 0) {
          for (const s of t.subs) {
            const sTimeInfo = [];
            if (s.estimate_minutes) sTimeInfo.push(`예상 ${formatMinutes(s.estimate_minutes)}`);
            if (s.actual_minutes) sTimeInfo.push(`실제 ${formatMinutes(s.actual_minutes)}`);

            detailHtml += `<div class="cal-detail-item cal-detail-sub">
              <span class="cal-detail-check sub">&#10003;</span>
              <span class="cal-detail-title">${escHtml(s.title)}</span>
              ${sTimeInfo.length ? `<span class="cal-detail-time">${sTimeInfo.join(' / ')}</span>` : ''}
            </div>`;
            if (s.description) {
              detailHtml += `<div class="cal-detail-desc cal-detail-sub-desc">${escHtml(s.description)}</div>`;
            }
          }
        }
      }
    }

    if (dayPlannedItems.length > 0) {
      detailHtml += '<div class="cal-detail-section-title">예정 / 할 일</div>';
      for (const t of dayPlannedItems) {
        const timeInfo = [];
        if (t.estimate_minutes) timeInfo.push(`예상 ${formatMinutes(t.estimate_minutes)}`);
        if (t.subtasks && t.subtasks.length > 0) timeInfo.push(`서브 ${t.subtasks.length}개`);

        detailHtml += `<div class="cal-detail-item">
          <span class="cal-detail-check plan">&#9711;</span>
          <span class="cal-detail-title">${escHtml(t.title)}</span>
          ${timeInfo.length ? `<span class="cal-detail-time">${timeInfo.join(' / ')}</span>` : ''}
        </div>`;
        if (t.description) {
          detailHtml += `<div class="cal-detail-desc">${escHtml(t.description)}</div>`;
        }
      }
    }

    const daySchedItems = schedByDay[dateStr] || [];
    if (daySchedItems.length > 0) {
      const schedMins = daySchedItems.reduce((sum, s) => {
        if (!s.start_time || !s.end_time) return sum;
        const [sh, sm] = s.start_time.split(':').map(Number);
        const [eh, em] = s.end_time.split(':').map(Number);
        return sum + (eh * 60 + em) - (sh * 60 + sm);
      }, 0);
      const sH = Math.floor(schedMins / 60);
      const sM = schedMins % 60;
      const schedTotal = sH > 0 ? (sM > 0 ? `${sH}시간 ${sM}분` : `${sH}시간`) : `${sM}분`;
      detailHtml += `<div class="cal-detail-section-title">📅 스케줄 <span class="cal-detail-sched-total">총 ${schedTotal}</span></div>`;
      for (const s of daySchedItems) {
        const timeRange = [s.start_time, s.end_time].filter(Boolean).map(t => t.slice(0, 5)).join(' ~ ');
        detailHtml += `<div class="cal-detail-item cal-detail-sched">
          <span class="cal-detail-check sched">⏰</span>
          <span class="cal-detail-title">${escHtml(s.title)}</span>
          ${timeRange ? `<span class="cal-detail-time">${timeRange}</span>` : ''}
        </div>`;
        if (s.description) {
          detailHtml += `<div class="cal-detail-desc">${escHtml(s.description)}</div>`;
        }
      }
    }

    const dayWorkSec = workByDay[dateStr] || 0;
    if (dayWorkSec > 0) {
      const wH = Math.floor(dayWorkSec / 3600);
      const wM = Math.floor((dayWorkSec % 3600) / 60);
      const wLabel = wH > 0 ? (wM > 0 ? `${wH}시간 ${wM}분` : `${wH}시간`) : `${wM}분`;
      detailHtml += `<div class="cal-detail-section-title">⏱ 실제 작업 시간 <span class="cal-detail-work-total">${wLabel}</span></div>`;
    }

    detailHtml += `</div>
      <div class="cal-detail-add">
        <input type="text" class="cal-add-input" data-date="${dateStr}" placeholder="이 날의 완료 작업 일지 추가..." />
      </div>
    </div>`;
    html += detailHtml;
  }

  container.innerHTML = html;

  document.getElementById('cal-prev').addEventListener('click', async () => {
    calendarMonth--;
    if (calendarMonth < 1) { calendarMonth = 12; calendarYear--; }
    $('#view-title').textContent = `${calendarYear}년 ${calendarMonth}월`;
    selectedCalDay = null;
    await renderCalendar();
  });

  document.getElementById('cal-next').addEventListener('click', async () => {
    calendarMonth++;
    if (calendarMonth > 12) { calendarMonth = 1; calendarYear++; }
    $('#view-title').textContent = `${calendarYear}년 ${calendarMonth}월`;
    selectedCalDay = null;
    await renderCalendar();
  });

  container.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', async () => {
      const date = cell.dataset.date;
      if (!date) return;
      selectedCalDay = (selectedCalDay === date) ? null : date;
      await renderCalendar();
    });
  });

  container.querySelectorAll('.cal-detail-close').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      selectedCalDay = null;
      await renderCalendar();
    });
  });

  container.querySelectorAll('.cal-detail-restore').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      await window.orbit.updateTask(id, { status: 'pending' });
      clearCalendarPlannedCache();
      await renderCalendar();
    });
  });

  container.querySelectorAll('.cal-add-input').forEach(input => {
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const title = input.value.trim();
      if (!title) return;
      const date = input.dataset.date;
      await window.orbit.createTask({ title, target_date: date, status: 'done' });
      input.value = '';
      clearCalendarPlannedCache();
      await renderCalendar();
    });
  });

  container.querySelectorAll('.cal-memo-text').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      const current = el.classList.contains('placeholder') ? '' : el.textContent;
      const memo = el.closest('.cal-detail-memo');
      memo.innerHTML = `<textarea class="cal-memo-input" data-id="${id}" rows="2">${escHtml(current)}</textarea>`;
      const ta = memo.querySelector('.cal-memo-input');
      ta.focus();
      ta.addEventListener('focusout', async () => {
        const val = ta.value.trim();
        await window.orbit.updateTask(Number(id), { description: val || null });
        await renderCalendar();
      });
      ta.addEventListener('keydown', async (ev) => {
        if (ev.key === 'Escape') await renderCalendar();
      });
    });
  });
}

// ── Stopwatch helpers ──

function calcElapsed(base, startedAt) {
  if (!startedAt) return base;
  const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  return base + Math.max(0, diff);
}

function formatSec(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function nowLocal() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

let uiAudioCtx = null;
function playUiSfx(type = 'start') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!uiAudioCtx) uiAudioCtx = new AudioCtx();
    if (uiAudioCtx.state === 'suspended') uiAudioCtx.resume();

    const osc = uiAudioCtx.createOscillator();
    const gain = uiAudioCtx.createGain();
    osc.connect(gain);
    gain.connect(uiAudioCtx.destination);

    const now = uiAudioCtx.currentTime;
    if (type === 'complete') {
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.exponentialRampToValueAtTime(920, now + 0.09);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      osc.stop(now + 0.15);
    } else {
      osc.frequency.setValueAtTime(560, now);
      osc.frequency.exponentialRampToValueAtTime(760, now + 0.06);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.04, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      osc.stop(now + 0.1);
    }
    osc.start(now);
  } catch (_e) {
    // ignore audio failures silently
  }
}

async function startTaskTimer(id) {
  await window.orbit.updateTask(id, { stopwatch_started_at: nowLocal() });
  playUiSfx('start');
}

async function completeTaskWithStopwatch(id, cardEl) {
  const elapsed = Number(cardEl?.dataset?.swElapsed) || 0;
  const started = cardEl?.dataset?.swStarted;
  const totalSec = calcElapsed(elapsed, started);
  const actualMin = totalSec > 0 ? Math.ceil(totalSec / 60) : null;
  const fields = { status: 'done', stopwatch_elapsed: 0, stopwatch_started_at: null };
  if (actualMin) fields.actual_minutes = actualMin;
  await window.orbit.updateTask(id, fields);
  playUiSfx('complete');
}

function bindMainStopwatchCtx(menu, id, sourceEl) {
  const start = menu.querySelector('.mctx-sw-start');
  const pause = menu.querySelector('.mctx-sw-pause');
  const resume = menu.querySelector('.mctx-sw-resume');
  const stop = menu.querySelector('.mctx-sw-stop');

  if (start) start.addEventListener('click', async () => {
    menu.classList.add('hidden');
    await startTaskTimer(id);
  });
  if (pause) pause.addEventListener('click', async () => {
    menu.classList.add('hidden');
    const elapsed = Number(sourceEl.dataset.swElapsed) || 0;
    const started = sourceEl.dataset.swStarted;
    const total = calcElapsed(elapsed, started);
    await window.orbit.updateTask(id, { stopwatch_elapsed: total, stopwatch_started_at: null });
  });
  if (resume) resume.addEventListener('click', async () => {
    menu.classList.add('hidden');
    await startTaskTimer(id);
  });
  if (stop) stop.addEventListener('click', async () => {
    menu.classList.add('hidden');
    await window.orbit.updateTask(id, { stopwatch_elapsed: 0, stopwatch_started_at: null });
  });
}

setInterval(() => {
  document.querySelectorAll('.sw-display.running').forEach(el => {
    const elapsed = Number(el.dataset.swElapsed) || 0;
    const started = el.dataset.swStarted;
    if (started) el.textContent = formatSec(calcElapsed(elapsed, started));
  });
}, 1000);

setInterval(() => {
  const nowKey = todayYmd();
  if (nowKey === liveTodayKey) return;
  liveTodayKey = nowKey;
  clearCalendarPlannedCache();

  if (currentView === 'today') {
    currentDate = nowKey;
    syncDatePicker();
    loadTasks();
  }
}, 30000);

// ── Helpers ──

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function priorityLabel(p) {
  return { must: '필수', normal: '보통', low: '낮음' }[p] || p;
}

function formatMinutes(m) {
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r > 0 ? `${h}시간 ${r}분` : `${h}시간`;
  }
  return `${m}분`;
}

function formatDateTime(value) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 16);
}

init();
