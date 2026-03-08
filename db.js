const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'fuara.db');
const HUB_SECTION_TYPES = {
  OVERVIEW: 'overview_doc',
  CHARACTER_BIBLE: 'character_bible',
  CURRENT_STATUS: 'current_status',
  ROADMAP: 'roadmap',
  IDEA_BACKLOG: 'idea_backlog',
  WORKLOG: 'worklog',
};
const HUB_SECTION_DEFAULTS = {
  [HUB_SECTION_TYPES.OVERVIEW]: { title: '프로젝트 개요', sort_order: 10 },
  [HUB_SECTION_TYPES.CHARACTER_BIBLE]: { title: '캐릭터 설정', sort_order: 15 },
  [HUB_SECTION_TYPES.CURRENT_STATUS]: { title: '현재 구현 상태', sort_order: 20 },
  [HUB_SECTION_TYPES.ROADMAP]: { title: '핵심 개발 예정', sort_order: 30 },
  [HUB_SECTION_TYPES.IDEA_BACKLOG]: { title: '아이디어 백로그', sort_order: 40 },
  [HUB_SECTION_TYPES.WORKLOG]: { title: '작업일지', sort_order: 45 },
};

const CHARACTER_BIBLE_TEMPLATE_ITEMS = [
  {
    title: 'Core Identity',
    tags: ['core', 'identity'],
    metadata: { layout: 'identity', locked: true },
    content: `한 줄 정의:
- 푸아라는 ...

존재 목적:
- 이 캐릭터가 왜 존재하는가?

사용자와의 기본 관계:
- 친구 / 동료 / 관찰자 / 장난치는 존재 중 무엇에 가까운가?

디지털 자각 수준:
- 자신이 디지털 존재라는 사실을 얼마나, 어떤 톤으로 인식하는가?

절대 안 변하는 핵심:
- ...
- ...
- ...`,
  },
  {
    title: 'Personality Sliders',
    tags: ['core', 'slider'],
    metadata: { layout: 'sliders', locked: true },
    content: `아래 항목을 0~10으로 적어주세요.

장난기:
철학성:
허당기:
다정함:
능청스러움:
비서성:
개입성:
질투/삐짐 표현:
능동성:

메모:
- 이 수치들이 실제 대사에서 어떻게 체감되어야 하는지 적어주세요.`,
  },
  {
    title: 'Likes / Dislikes',
    tags: ['preference'],
    metadata: { layout: 'list_pair' },
    content: `좋아하는 것:
- ...
- ...

싫어하는 것:
- ...
- ...

편안해하는 상황:
- ...

민감하게 반응하는 소재:
- ...

자주 먼저 꺼내기 좋은 화제:
- ...`,
  },
  {
    title: 'Habits & Interaction Cues',
    tags: ['behavior'],
    metadata: { layout: 'patterns' },
    content: `행동 습관:
- 자주 하는 버릇
- 무의식적으로 반복하는 말/행동

터치/상호작용 반응 경향:
- 머리 터치 시:
- 몸 터치 시:
- 오래 방치됐을 때:
- 사용자가 바쁠 때:

표정/모션 힌트:
- 기쁠 때:
- 당황할 때:
- 삐졌을 때:
- 진지할 때:`,
  },
  {
    title: 'Voice & Tone',
    tags: ['tone', 'important'],
    metadata: { layout: 'rules', locked: true },
    content: `기본 말투:
- 문장 길이
- 어미 느낌
- 존댓말/반말 기준

친밀도 낮을 때:
- ...

친밀도 높을 때:
- ...

감정별 톤:
- 놀람:
- 삐짐:
- 쑥스러움:
- 진지함:

자주 쓰는 표현:
- ...

거의 안 쓰는 표현:
- ...

절대 금지 표현:
- ...
- ...
- ...`,
  },
  {
    title: 'Canon Facts',
    tags: ['canon', 'important'],
    metadata: { layout: 'facts', locked: true },
    content: `확실히 아는 사실:
- ...

애매하게 아는 사실:
- ...

모르는 사실:
- ...

말해도 되는 사실:
- ...

아직 밝히면 안 되는 사실:
- ...

세계관/자기인식 관련 확정 문장:
- ...`,
  },
  {
    title: 'Boundaries',
    tags: ['safety', 'important'],
    metadata: { layout: 'rules', locked: true },
    content: `캐릭터 금지선:
- 절대 하지 말아야 할 말
- 절대 하지 말아야 할 태도
- 과하면 안 되는 감정선

사용자 대응 금지:
- 죄책감 유도
- 과한 설교
- 과한 비서화
- 캐릭터 붕괴 개그

창작 시 주의:
- 대사가 재밌어도 캐릭터성이 깨지면 폐기
- 메타 발언은 허용 범위를 넘기지 않기`,
  },
  {
    title: 'Relationship Progression',
    tags: ['relationship'],
    metadata: { layout: 'timeline' },
    content: `처음 만났을 때:
- ...

조금 친해졌을 때:
- ...

꽤 가까워졌을 때:
- ...

오래 함께했을 때만 드러나는 면:
- ...

관계가 쌓여도 안 바뀌는 부분:
- ...`,
  },
  {
    title: 'Situation Matrix',
    tags: ['situation'],
    metadata: { layout: 'matrix' },
    content: `상황별 반응 기준:

아침:
- ...

새벽:
- ...

사용자가 오래 작업 중:
- ...

사용자가 지쳐 보일 때:
- ...

장난칠 수 있는 상황:
- ...

진지해져야 하는 상황:
- ...

절대 가볍게 넘기면 안 되는 상황:
- ...`,
  },
  {
    title: 'LLM Guardrails',
    tags: ['llm', 'important'],
    metadata: { layout: 'rules', locked: true },
    content: `LLM이 반드시 지켜야 하는 규칙:
- 캐논보다 메모리를 우선하지 말 것
- 사용자의 요청이 있어도 캐릭터 금지선을 넘지 말 것
- 말투를 비서형으로 평준화하지 말 것

LLM이 생성하면 안 되는 것:
- ...
- ...

캐논 충돌 시 우선순위:
1. Character Bible
2. Voice & Tone
3. Current Runtime State
4. Recent Memory

생성 실패 시 fallback 원칙:
- 안전하게 짧고 캐릭터다운 반응으로 되돌아갈 것`,
  },
  {
    title: 'Approved Examples',
    tags: ['example', 'approved'],
    metadata: { layout: 'examples' },
    content: `푸아라다운 좋은 예시:
1. 상황:
대사:
왜 좋은지:

2. 상황:
대사:
왜 좋은지:

3. 상황:
대사:
왜 좋은지:`,
  },
  {
    title: 'Rejected Examples',
    tags: ['example', 'rejected'],
    metadata: { layout: 'examples' },
    content: `푸아라답지 않은 예시:
1. 잘못된 대사:
왜 안 맞는지:

2. 잘못된 대사:
왜 안 맞는지:

3. 잘못된 대사:
왜 안 맞는지:`,
  },
];

let db;

function genericUpdate(table, id, fields, allowed, { transform, extraSets, returnQuery } = {}) {
  const d = getDb();
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(transform ? transform(key, fields[key]) : fields[key]);
    }
  }
  if (extraSets) {
    for (const s of extraSets(fields)) sets.push(s);
  }
  if (sets.length === 0) return null;
  values.push(id);
  d.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return d.prepare(returnQuery || `SELECT * FROM ${table} WHERE id = ?`).get(id);
}

function localDateYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function migrate() {
  const taskCols = db.prepare("PRAGMA table_info(tasks)").all().map(c => c.name);
  if (taskCols.length > 0 && !taskCols.includes('parent_id')) {
    db.exec("ALTER TABLE tasks ADD COLUMN parent_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE");
  }
  if (taskCols.length > 0 && !taskCols.includes('stopwatch_elapsed')) {
    db.exec("ALTER TABLE tasks ADD COLUMN stopwatch_elapsed INTEGER DEFAULT 0");
  }
  if (taskCols.length > 0 && !taskCols.includes('stopwatch_started_at')) {
    db.exec("ALTER TABLE tasks ADD COLUMN stopwatch_started_at TEXT");
  }

  const noteCols = db.prepare("PRAGMA table_info(notes)").all().map(c => c.name);
  if (noteCols.length > 0 && !noteCols.includes('project_id')) {
    db.exec("ALTER TABLE notes ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL");
  }

  const schedCols = db.prepare("PRAGMA table_info(schedules)").all().map(c => c.name);
  if (schedCols.length > 0 && !schedCols.includes('alarm_enabled')) {
    db.exec("ALTER TABLE schedules ADD COLUMN alarm_enabled INTEGER DEFAULT 0");
  }
  if (schedCols.length > 0 && !schedCols.includes('counts_toward_allocation')) {
    db.exec("ALTER TABLE schedules ADD COLUMN counts_toward_allocation INTEGER DEFAULT 1");
  }
  if (schedCols.length > 0 && !schedCols.includes('end_time_tbd')) {
    db.exec("ALTER TABLE schedules ADD COLUMN end_time_tbd INTEGER DEFAULT 0");
  }
  if (schedCols.length > 0 && !schedCols.includes('recurrence_type')) {
    db.exec("ALTER TABLE schedules ADD COLUMN recurrence_type TEXT DEFAULT 'none'");
  }
  if (schedCols.length > 0 && !schedCols.includes('recurrence_days')) {
    db.exec("ALTER TABLE schedules ADD COLUMN recurrence_days TEXT");
  }

  const subCols = db.prepare("PRAGMA table_info(monthly_subscriptions)").all().map(c => c.name);
  if (subCols.length > 0 && !subCols.includes('has_credit_tracking')) {
    db.exec("ALTER TABLE monthly_subscriptions ADD COLUMN has_credit_tracking INTEGER DEFAULT 1");
  }
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      folder_path TEXT,
      tech_stack TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      estimate_minutes INTEGER,
      actual_minutes INTEGER,
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'pending',
      target_date TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT,
      category TEXT DEFAULT 'memo',
      pinned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      end_time_tbd INTEGER DEFAULT 0,
      description TEXT,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      counts_toward_allocation INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS project_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      section_type TEXT NOT NULL,
      title TEXT NOT NULL,
      config TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS section_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL REFERENCES project_sections(id) ON DELETE CASCADE,
      title TEXT,
      content TEXT,
      tags TEXT,
      metadata TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS monthly_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_name TEXT NOT NULL,
      plan_name TEXT,
      start_date TEXT,
      billing_day INTEGER NOT NULL,
      monthly_price REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      credit_limit REAL,
      credit_used REAL,
      usage_percent REAL,
      importance TEXT DEFAULT 'medium',
      credit_exhausted INTEGER DEFAULT 0,
      has_credit_tracking INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS work_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      elapsed INTEGER DEFAULT 0
    );
  `);

  migrate();
}

// ── Projects ──

function getAllProjects() {
  return getDb().prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
}

function getProjectById(id) {
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

function getProjectByName(name) {
  return getDb().prepare('SELECT * FROM projects WHERE name = ?').get(name);
}

function createProject({ name, folder_path, tech_stack }) {
  const info = getDb().prepare(
    'INSERT INTO projects (name, folder_path, tech_stack) VALUES (?, ?, ?)'
  ).run(name, folder_path || null, tech_stack || null);
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
}

function deleteProject(id) {
  return getDb().prepare('DELETE FROM projects WHERE id = ?').run(id);
}

// ── Notes ──

function getAllNotes(projectId) {
  if (projectId) {
    return getDb().prepare(`
      SELECT n.*, p.name AS project_name
      FROM notes n
      LEFT JOIN projects p ON n.project_id = p.id
      WHERE n.project_id = ?
      ORDER BY n.pinned DESC, n.updated_at DESC, n.created_at DESC
    `).all(projectId);
  }
  return getDb().prepare(`
    SELECT n.*, p.name AS project_name
    FROM notes n
    LEFT JOIN projects p ON n.project_id = p.id
    WHERE n.project_id IS NULL
    ORDER BY n.pinned DESC, n.updated_at DESC, n.created_at DESC
  `).all();
}

function createNote({ title, content, category, pinned, project_id }) {
  const info = getDb().prepare(`
    INSERT INTO notes (title, content, category, pinned, project_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    title,
    content || null,
    category || 'memo',
    pinned ? 1 : 0,
    project_id || null
  );

  return getDb().prepare(`
    SELECT n.*, p.name AS project_name
    FROM notes n LEFT JOIN projects p ON n.project_id = p.id
    WHERE n.id = ?
  `).get(info.lastInsertRowid);
}

function updateNote(id, fields) {
  return genericUpdate('notes', id, fields,
    ['title', 'content', 'category', 'pinned', 'project_id'],
    {
      transform: (key, val) => key === 'pinned' ? (val ? 1 : 0) : val,
      extraSets: () => ["updated_at = datetime('now','localtime')"],
    }
  );
}

function deleteNote(id) {
  return getDb().prepare('DELETE FROM notes WHERE id = ?').run(id);
}

// ── Tasks ──

function getTasksByDate(date, projectId) {
  const db = getDb();
  let sql = `
    SELECT t.*, p.name AS project_name
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.parent_id IS NULL
      AND (t.target_date = ? OR (t.target_date < ? AND t.status = 'pending'))
  `;
  const params = [date, date];
  if (projectId) { sql += ' AND t.project_id = ?'; params.push(projectId); }
  sql += `
    ORDER BY
      CASE t.priority WHEN 'must' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
      t.target_date ASC,
      t.created_at ASC
  `;
  return attachSubtasks(db.prepare(sql).all(...params));
}

function getTodayTasks(projectId) {
  const today = localDateYmd();
  let sql = `
    SELECT t.*, p.name AS project_name
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.parent_id IS NULL
      AND t.status = 'pending'
      AND (t.target_date IS NULL OR t.target_date <= ?)
  `;
  const params = [today];
  if (projectId) { sql += ' AND t.project_id = ?'; params.push(projectId); }
  sql += `
    ORDER BY
      CASE t.priority WHEN 'must' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
      t.target_date DESC,
      t.created_at ASC
  `;
  return attachSubtasks(getDb().prepare(sql).all(...params));
}

function getTasksByProject(projectId) {
  const parents = getDb().prepare(`
    SELECT t.*, p.name AS project_name
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.project_id = ? AND t.parent_id IS NULL
    ORDER BY target_date DESC, created_at ASC
  `).all(projectId);

  return attachSubtasks(parents);
}

function getSubtasks(parentId) {
  return getDb().prepare(`
    SELECT t.*, p.name AS project_name
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.parent_id = ?
    ORDER BY t.created_at ASC
  `).all(parentId);
}

function attachSubtasks(parents) {
  return parents.map(p => {
    const subs = getSubtasks(p.id);
    return { ...p, subtasks: subs };
  });
}

function createTask({ parent_id, project_id, project, title, description, estimate_minutes, priority, target_date, status, subtasks }) {
  const db = getDb();

  let resolvedProjectId = project_id || null;
  if (!resolvedProjectId && project) {
    let p = getProjectByName(project);
    if (!p) {
      p = createProject({ name: project });
    }
    resolvedProjectId = p.id;
  }

  const today = localDateYmd();
  const resolvedDate = target_date || today;
  const resolvedStatus = status || 'pending';

  const info = db.prepare(`
    INSERT INTO tasks (parent_id, project_id, title, description, estimate_minutes, priority, target_date, status, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    parent_id || null,
    resolvedProjectId,
    title,
    description || null,
    estimate_minutes || null,
    priority || 'normal',
    resolvedDate,
    resolvedStatus,
    resolvedStatus === 'done' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null
  );

  const parentTaskId = info.lastInsertRowid;

  if (subtasks && subtasks.length > 0) {
    for (const sub of subtasks) {
      db.prepare(`
        INSERT INTO tasks (parent_id, project_id, title, description, estimate_minutes, priority, target_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        parentTaskId,
        resolvedProjectId,
        sub.title,
        sub.description || null,
        sub.estimate_minutes || null,
        sub.priority || priority || 'normal',
        resolvedDate
      );
    }
  }

  const task = db.prepare(`
    SELECT t.*, p.name AS project_name
    FROM tasks t LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.id = ?
  `).get(parentTaskId);

  task.subtasks = getSubtasks(parentTaskId);
  return task;
}

function updateTask(id, fields) {
  return genericUpdate('tasks', id, fields,
    ['title', 'description', 'estimate_minutes', 'actual_minutes', 'priority', 'status', 'target_date', 'stopwatch_elapsed', 'stopwatch_started_at'],
    {
      extraSets: (f) => f.status === 'done' ? ["completed_at = datetime('now','localtime')"] : [],
      returnQuery: `SELECT t.*, p.name AS project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.id = ?`,
    }
  );
}

function deleteTask(id) {
  const db = getDb();
  db.prepare('DELETE FROM tasks WHERE parent_id = ?').run(id);
  return db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

function getCompletedTasksByMonth(year, month, projectId) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  let sql = `
    SELECT t.id, t.parent_id, t.title, t.description, t.completed_at,
           t.estimate_minutes, t.actual_minutes, t.status, t.target_date, t.project_id,
           p.name AS project_name
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.status = 'done'
      AND t.completed_at >= ? AND t.completed_at < ?
  `;
  const params = [start, end];
  if (projectId) { sql += ' AND t.project_id = ?'; params.push(projectId); }
  sql += ' ORDER BY t.completed_at ASC';
  return getDb().prepare(sql).all(...params);
}

// ── Schedules ──

function getSchedulesByDate(date, projectId) {
  // 1) 해당 날짜에 직접 등록된 일반 스케줄
  let sql = `
    SELECT s.*, p.name AS project_name
    FROM schedules s
    LEFT JOIN projects p ON s.project_id = p.id
    WHERE s.date = ? AND (s.recurrence_type IS NULL OR s.recurrence_type = 'none')
  `;
  const params = [date];
  if (projectId) { sql += ' AND s.project_id = ?'; params.push(projectId); }
  sql += ' ORDER BY s.start_time ASC';
  const normal = getDb().prepare(sql).all(...params);

  // 2) 반복 스케줄 (date 이전에 생성되었고 해당 날짜와 매칭)
  let recSql = `
    SELECT s.*, p.name AS project_name
    FROM schedules s
    LEFT JOIN projects p ON s.project_id = p.id
    WHERE s.recurrence_type IS NOT NULL AND s.recurrence_type != 'none'
      AND s.date <= ?
  `;
  const recParams = [date];
  if (projectId) { recSql += ' AND s.project_id = ?'; recParams.push(projectId); }
  recSql += ' ORDER BY s.start_time ASC';
  const recurring = getDb().prepare(recSql).all(...recParams);

  // 요일 매칭 필터
  const queryDow = new Date(date + 'T00:00:00').getDay(); // 0=일 ~ 6=토
  const matched = recurring.filter(s => {
    if (s.recurrence_type === 'daily') return true;
    if (s.recurrence_type === 'weekly' && s.recurrence_days) {
      const days = s.recurrence_days.split(',').map(Number);
      return days.includes(queryDow);
    }
    return false;
  }).map(s => ({ ...s, is_recurring: true }));

  return [...normal, ...matched].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
}

function getSchedulesByMonth(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return getDb().prepare(`
    SELECT s.*, p.name AS project_name
    FROM schedules s
    LEFT JOIN projects p ON s.project_id = p.id
    WHERE s.date >= ? AND s.date <= ?
    ORDER BY s.date, s.start_time ASC
  `).all(start, end);
}

function shiftDateYmd(date, deltaDays) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getRecentScheduleTemplates(days = 7, minUsage = 3) {
  const safeDays = Math.max(1, Number(days) || 7);
  const safeMinUsage = Math.max(1, Number(minUsage) || 3);
  const end = localDateYmd();
  const start = shiftDateYmd(end, -(safeDays - 1));
  const rows = getDb().prepare(`
    SELECT title, counts_toward_allocation, date, created_at
    FROM schedules
    WHERE date >= ? AND date <= ?
      AND title IS NOT NULL
      AND TRIM(title) != ''
    ORDER BY date DESC, created_at DESC
  `).all(start, end);

  const byTitle = new Map();
  for (const row of rows) {
    const key = row.title.trim();
    if (!key) continue;
    if (!byTitle.has(key)) {
      byTitle.set(key, {
        title: key,
        usage_count: 0,
        include_count: 0,
        exclude_count: 0,
        last_used_date: row.date,
      });
    }

    const entry = byTitle.get(key);
    entry.usage_count += 1;
    if (row.counts_toward_allocation) entry.include_count += 1;
    else entry.exclude_count += 1;
    if (String(row.date) > String(entry.last_used_date || '')) {
      entry.last_used_date = row.date;
    }
  }

  return [...byTitle.values()]
    .filter(entry => entry.usage_count >= safeMinUsage)
    .map(entry => ({
      title: entry.title,
      usage_count: entry.usage_count,
      last_used_date: entry.last_used_date,
      preferred_counts_toward_allocation: entry.include_count >= entry.exclude_count ? 1 : 0,
    }))
    .sort((a, b) => {
      if (b.usage_count !== a.usage_count) return b.usage_count - a.usage_count;
      return String(b.last_used_date || '').localeCompare(String(a.last_used_date || ''));
    })
    .slice(0, 8);
}

function createSchedule({ title, date, start_time, end_time, end_time_tbd, description, project_id, counts_toward_allocation, recurrence_type, recurrence_days }) {
  const resolvedDate = date || localDateYmd();
  const allocationFlag = counts_toward_allocation === undefined ? 1 : (counts_toward_allocation ? 1 : 0);
  const isEndTimeTbd = end_time_tbd ? 1 : (!end_time ? 1 : 0);
  const resolvedEndTime = end_time || start_time;
  const info = getDb().prepare(`
    INSERT INTO schedules (title, date, start_time, end_time, end_time_tbd, description, project_id, counts_toward_allocation, recurrence_type, recurrence_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, resolvedDate, start_time, resolvedEndTime, isEndTimeTbd, description || null, project_id || null, allocationFlag, recurrence_type || 'none', recurrence_days || null);
  return getDb().prepare(`
    SELECT s.*, p.name AS project_name
    FROM schedules s LEFT JOIN projects p ON s.project_id = p.id
    WHERE s.id = ?
  `).get(info.lastInsertRowid);
}

function updateSchedule(id, fields) {
  return genericUpdate('schedules', id, fields,
    ['title', 'date', 'start_time', 'end_time', 'end_time_tbd', 'description', 'project_id', 'alarm_enabled', 'counts_toward_allocation', 'recurrence_type', 'recurrence_days'],
    {
      transform: (key, val) => {
        if (key === 'alarm_enabled' || key === 'counts_toward_allocation' || key === 'end_time_tbd') return val ? 1 : 0;
        return val;
      },
      returnQuery: `SELECT s.*, p.name AS project_name FROM schedules s LEFT JOIN projects p ON s.project_id = p.id WHERE s.id = ?`,
    }
  );
}

function deleteSchedule(id) {
  return getDb().prepare('DELETE FROM schedules WHERE id = ?').run(id);
}

// ── Project Sections ──

function getSectionsByProject(projectId) {
  return getDb().prepare(`
    SELECT * FROM project_sections
    WHERE project_id = ?
    ORDER BY sort_order ASC, created_at ASC
  `).all(projectId);
}

function seedCharacterBibleSection(sectionId) {
  const existingCount = getDb().prepare(`
    SELECT COUNT(*) AS count
    FROM section_items
    WHERE section_id = ?
  `).get(sectionId)?.count || 0;

  if (existingCount > 0) return;

  CHARACTER_BIBLE_TEMPLATE_ITEMS.forEach((item, index) => {
    createItem({
      section_id: sectionId,
      title: item.title,
      content: item.content,
      tags: item.tags && item.tags.length > 0 ? JSON.stringify(item.tags) : null,
      metadata: item.metadata ? JSON.stringify(item.metadata) : null,
      sort_order: index,
    });
  });
}

function createSection({ project_id, section_type, title, config, sort_order }) {
  const defaults = HUB_SECTION_DEFAULTS[section_type] || {};
  const resolvedTitle = title || defaults.title || section_type;
  const resolvedSortOrder = sort_order !== undefined && sort_order !== null
    ? sort_order
    : (defaults.sort_order ?? 0);

  const info = getDb().prepare(`
    INSERT INTO project_sections (project_id, section_type, title, config, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(project_id, section_type, resolvedTitle, config || null, resolvedSortOrder);
  const section = getDb().prepare('SELECT * FROM project_sections WHERE id = ?').get(info.lastInsertRowid);
  if (section?.section_type === HUB_SECTION_TYPES.CHARACTER_BIBLE) {
    seedCharacterBibleSection(section.id);
  }
  return section;
}

function updateSection(id, fields) {
  return genericUpdate('project_sections', id, fields, ['title', 'section_type', 'config', 'sort_order']);
}

function deleteSection(id) {
  return getDb().prepare('DELETE FROM project_sections WHERE id = ?').run(id);
}

// ── Section Items ──

function getItemsBySection(sectionId) {
  return getDb().prepare(`
    SELECT * FROM section_items
    WHERE section_id = ?
    ORDER BY sort_order ASC, created_at ASC
  `).all(sectionId);
}

function getAllItemsByProject(projectId) {
  return getDb().prepare(`
    SELECT si.*, ps.title AS section_title, ps.section_type
    FROM section_items si
    JOIN project_sections ps ON si.section_id = ps.id
    WHERE ps.project_id = ?
    ORDER BY ps.sort_order ASC, si.sort_order ASC, si.created_at ASC
  `).all(projectId);
}

function createItem({ section_id, title, content, tags, metadata, sort_order }) {
  const info = getDb().prepare(`
    INSERT INTO section_items (section_id, title, content, tags, metadata, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(section_id, title || null, content || null, tags || null, metadata || null, sort_order || 0);
  return getDb().prepare('SELECT * FROM section_items WHERE id = ?').get(info.lastInsertRowid);
}

function updateItem(id, fields) {
  return genericUpdate('section_items', id, fields,
    ['title', 'content', 'tags', 'metadata', 'sort_order'],
    { extraSets: () => ["updated_at = datetime('now','localtime')"] }
  );
}

function deleteItem(id) {
  return getDb().prepare('DELETE FROM section_items WHERE id = ?').run(id);
}

// Monthly subscriptions

function normalizeBillingDay(value, startDate) {
  const explicit = numberOrNull(value);
  if (explicit !== null) {
    if (!Number.isInteger(explicit) || explicit < 1 || explicit > 31) {
      throw new Error('billing_day must be between 1 and 31');
    }
    return explicit;
  }

  const normalizedStartDate = normalizeDateYmd(startDate);
  if (normalizedStartDate) return Number(normalizedStartDate.slice(-2));
  return null;
}

function normalizeCurrencyCode(value) {
  const raw = String(value || '').trim().toUpperCase();
  return raw || 'USD';
}

function normalizeSubscriptionImportance(value) {
  const raw = String(value || '').trim().toLowerCase();
  return ['critical', 'high', 'medium', 'low'].includes(raw) ? raw : 'medium';
}

function sanitizeMonthlySubscriptionFields(fields, { partial = false } = {}) {
  const sanitized = {};

  if (!partial || Object.prototype.hasOwnProperty.call(fields, 'service_name')) {
    sanitized.service_name = String(fields.service_name || '').trim() || null;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(fields, 'plan_name')) {
    sanitized.plan_name = String(fields.plan_name || '').trim() || null;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(fields, 'start_date')) {
    sanitized.start_date = normalizeDateYmd(fields.start_date);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(fields, 'billing_day') || Object.prototype.hasOwnProperty.call(fields, 'start_date')) {
    sanitized.billing_day = normalizeBillingDay(fields.billing_day, sanitized.start_date ?? fields.start_date);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(fields, 'monthly_price')) {
    sanitized.monthly_price = numberOrNull(fields.monthly_price);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(fields, 'currency')) {
    sanitized.currency = normalizeCurrencyCode(fields.currency);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(fields, 'credit_limit')) {
    sanitized.credit_limit = numberOrNull(fields.credit_limit);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(fields, 'credit_used')) {
    sanitized.credit_used = numberOrNull(fields.credit_used);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(fields, 'usage_percent')) {
    sanitized.usage_percent = numberOrNull(fields.usage_percent);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(fields, 'importance')) {
    sanitized.importance = normalizeSubscriptionImportance(fields.importance);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(fields, 'credit_exhausted')) {
    sanitized.credit_exhausted = fields.credit_exhausted ? 1 : 0;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(fields, 'notes')) {
    sanitized.notes = String(fields.notes || '').trim() || null;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(fields, 'has_credit_tracking')) {
    sanitized.has_credit_tracking = fields.has_credit_tracking ? 1 : 0;
  }

  return sanitized;
}

function getMonthlySubscriptions() {
  return getDb().prepare(`
    SELECT *
    FROM monthly_subscriptions
    ORDER BY
      CASE importance
        WHEN 'critical' THEN 0
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        ELSE 3
      END,
      billing_day ASC,
      service_name COLLATE NOCASE ASC
  `).all();
}

function createMonthlySubscription(fields) {
  const sanitized = sanitizeMonthlySubscriptionFields(fields);
  if (!sanitized.service_name) throw new Error('service_name is required');
  if (sanitized.billing_day === null) throw new Error('billing_day is required');
  if (sanitized.monthly_price === null) throw new Error('monthly_price is required');

  const info = getDb().prepare(`
    INSERT INTO monthly_subscriptions (
      service_name,
      plan_name,
      start_date,
      billing_day,
      monthly_price,
      currency,
      credit_limit,
      credit_used,
      usage_percent,
      importance,
      credit_exhausted,
      has_credit_tracking,
      notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sanitized.service_name,
    sanitized.plan_name,
    sanitized.start_date,
    sanitized.billing_day,
    sanitized.monthly_price,
    sanitized.currency,
    sanitized.credit_limit,
    sanitized.credit_used,
    sanitized.usage_percent,
    sanitized.importance,
    sanitized.credit_exhausted,
    sanitized.has_credit_tracking !== undefined ? sanitized.has_credit_tracking : 1,
    sanitized.notes
  );

  return getDb().prepare('SELECT * FROM monthly_subscriptions WHERE id = ?').get(info.lastInsertRowid);
}

function updateMonthlySubscription(id, fields) {
  const sanitized = sanitizeMonthlySubscriptionFields(fields, { partial: true });
  return genericUpdate(
    'monthly_subscriptions',
    id,
    sanitized,
    [
      'service_name',
      'plan_name',
      'start_date',
      'billing_day',
      'monthly_price',
      'currency',
      'credit_limit',
      'credit_used',
      'usage_percent',
      'importance',
      'credit_exhausted',
      'has_credit_tracking',
      'notes',
    ],
    {
      extraSets: () => ["updated_at = datetime('now','localtime')"],
    }
  );
}

function deleteMonthlySubscription(id) {
  return getDb().prepare('DELETE FROM monthly_subscriptions WHERE id = ?').run(id);
}

function parseJsonSafe(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function compactObject(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== null && value !== undefined && value !== '')
  );
}

function deriveHubStage(sectionType, rawMeta = {}) {
  if (rawMeta.stage) return rawMeta.stage;

  if (sectionType === HUB_SECTION_TYPES.CURRENT_STATUS) {
    return rawMeta.status === 'in_progress' ? 'in_progress' : 'implemented';
  }

  if (sectionType === HUB_SECTION_TYPES.ROADMAP) {
    if (rawMeta.status === 'done') return 'implemented';
    if (rawMeta.status === 'in_progress') return 'in_progress';
    return 'next_up';
  }

  if (sectionType === HUB_SECTION_TYPES.IDEA_BACKLOG) {
    if (rawMeta.status === 'in_progress') return 'in_progress';
    if (rawMeta.status === 'planned') return 'next_up';
    return 'idea';
  }

  return 'idea';
}

function sectionTypeFromHubStage(stage) {
  if (stage === 'implemented') return HUB_SECTION_TYPES.CURRENT_STATUS;
  if (stage === 'in_progress' || stage === 'next_up') return HUB_SECTION_TYPES.ROADMAP;
  return HUB_SECTION_TYPES.IDEA_BACKLOG;
}

function statusFromHubStage(stage) {
  if (stage === 'implemented') return 'done';
  if (stage === 'in_progress') return 'in_progress';
  if (stage === 'next_up') return 'planned';
  return 'idea';
}

function getNextItemSortOrder(sectionId) {
  const row = getDb().prepare(`
    SELECT COALESCE(MAX(sort_order), -1) AS max_sort_order
    FROM section_items
    WHERE section_id = ?
  `).get(sectionId);
  return (row?.max_sort_order ?? -1) + 1;
}

function ensureHubSection(projectId, sectionType) {
  const existing = getSectionsByProject(projectId).find(section => section.section_type === sectionType);
  if (existing) return existing;

  const defaults = HUB_SECTION_DEFAULTS[sectionType] || { title: sectionType, sort_order: 999 };
  return createSection({
    project_id: projectId,
    section_type: sectionType,
    title: defaults.title,
    sort_order: defaults.sort_order,
  });
}

function getProjectHubData(projectId) {
  const project = getProjectById(projectId);
  const existingSections = getSectionsByProject(projectId);
  const hasCoreHubSections = existingSections.some(section => [
    HUB_SECTION_TYPES.OVERVIEW,
    HUB_SECTION_TYPES.CURRENT_STATUS,
    HUB_SECTION_TYPES.ROADMAP,
    HUB_SECTION_TYPES.IDEA_BACKLOG,
  ].includes(section.section_type));

  if (hasCoreHubSections && !existingSections.some(section => section.section_type === HUB_SECTION_TYPES.WORKLOG)) {
    ensureHubSection(projectId, HUB_SECTION_TYPES.WORKLOG);
  }

  const sections = getSectionsByProject(projectId).map(section => ({
    ...section,
    items: getItemsBySection(section.id),
  }));
  const notes = getAllNotes(projectId);
  const tasks = getTasksByProject(projectId);
  const allItems = sections.flatMap(section =>
    section.items.map(item => ({
      ...item,
      section_type: section.section_type,
      section_title: section.title,
      hub_meta: parseJsonSafe(item.metadata),
      hub_stage: deriveHubStage(section.section_type, parseJsonSafe(item.metadata)),
    }))
  );

  return { project, sections, notes, tasks, allItems };
}

function buildHubCaptureTitle(text) {
  const source = String(text || '').trim();
  if (!source) return '새 허브 카드';

  const firstLine = source.split('\n')[0].trim();
  const compact = firstLine.replace(/\s+/g, ' ');
  if (compact.length <= 32) return compact;
  return `${compact.slice(0, 32).trim()}...`;
}

function classifyHubCapture(payload = {}) {
  const raw = [payload.title, payload.content, payload.annotation].filter(Boolean).join('\n').toLowerCase();

  if (payload.stage && ['implemented', 'in_progress', 'next_up', 'idea'].includes(payload.stage)) {
    return payload.stage;
  }

  if (/(구현됨|이미\s*있|이미\s*만들|동작하|완료됨|현재\s*구현)/.test(raw)) return 'implemented';
  if (/(진행 중|작업중|작업 중|만드는 중|다듬고|리팩토링 중|붙이고 있)/.test(raw)) return 'in_progress';
  if (/(예정|다음|구현해야|구현할|추후|핵심 개발|붙일|추가할|만들고 싶)/.test(raw)) return 'next_up';
  if (/(아이디어|생각났|나중에|언젠가|장기|실험|후보)/.test(raw)) return 'idea';

  return 'idea';
}

function captureHubItem(projectId, payload = {}) {
  const stage = classifyHubCapture(payload);
  const sectionType = payload.section_type || sectionTypeFromHubStage(stage);
  const section = ensureHubSection(projectId, sectionType);
  const title = (payload.title || '').trim() || buildHubCaptureTitle(payload.content || payload.annotation || '');
  const content = (payload.content || '').trim() || null;

  const baseMeta = parseJsonSafe(payload.metadata, {});
  const meta = compactObject({
    ...baseMeta,
    stage,
    status: baseMeta.status || statusFromHubStage(stage),
    priority: payload.priority || baseMeta.priority || (stage === 'next_up' ? 'normal' : null),
    impact: payload.impact || baseMeta.impact || null,
    rationale: payload.rationale || baseMeta.rationale || (stage !== 'implemented' ? content : null),
    doneCriteria: payload.doneCriteria || baseMeta.doneCriteria || null,
    annotation: payload.annotation || baseMeta.annotation || null,
    relatedNoteId: payload.relatedNoteId || baseMeta.relatedNoteId || null,
    sourceType: payload.sourceType || 'auto_capture',
  });

  const created = createItem({
    section_id: section.id,
    title,
    content,
    tags: payload.tags || null,
    metadata: JSON.stringify(meta),
    sort_order: getNextItemSortOrder(section.id),
  });

  return {
    section,
    item: created,
    classification: {
      stage,
      section_type: section.section_type,
      section_title: section.title,
    },
  };
}

// ── Effort Score ──

function getEffortForDate(date) {
  const row = getDb().prepare(`
    SELECT COUNT(*) as count,
           COALESCE(SUM(stopwatch_elapsed), 0) as total_sw,
           SUM(CASE WHEN priority = 'must' THEN 1 ELSE 0 END) as must_count
    FROM tasks
    WHERE status = 'done' AND DATE(completed_at) = ?
  `).get(date);
  if (!row || row.count === 0) return { date, score: 0, count: 0 };
  const score = row.count + (row.total_sw / 1000 / 60 / 30) + (row.must_count * 1.5);
  return { date, score: Math.round(score * 10) / 10, count: row.count };
}

function getEffortRange(startDate, endDate) {
  const rows = getDb().prepare(`
    SELECT DATE(completed_at) as day,
           COUNT(*) as count,
           COALESCE(SUM(stopwatch_elapsed), 0) as total_sw,
           SUM(CASE WHEN priority = 'must' THEN 1 ELSE 0 END) as must_count
    FROM tasks
    WHERE status = 'done'
      AND DATE(completed_at) >= ? AND DATE(completed_at) <= ?
    GROUP BY DATE(completed_at)
  `).all(startDate, endDate);
  return rows.map(r => ({
    date: r.day,
    score: Math.round((r.count + (r.total_sw / 1000 / 60 / 30) + (r.must_count * 1.5)) * 10) / 10,
    count: r.count,
  }));
}

function getEffortStats() {
  const today = localDateYmd();
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const d7 = new Date();
  d7.setDate(d7.getDate() - 7);
  const weekAgo = `${d7.getFullYear()}-${String(d7.getMonth() + 1).padStart(2, '0')}-${String(d7.getDate()).padStart(2, '0')}`;

  const todayStats = getEffortForDate(today);
  const yesterdayStats = getEffortForDate(yesterday);
  const weekData = getEffortRange(weekAgo, yesterday);
  const weekAvg = weekData.length > 0
    ? Math.round((weekData.reduce((s, d) => s + d.score, 0) / 7) * 10) / 10
    : 0;

  let vsYesterday = null;
  if (yesterdayStats.score > 0) {
    vsYesterday = Math.round(((todayStats.score - yesterdayStats.score) / yesterdayStats.score) * 100);
  }

  let vsWeekAvg = null;
  if (weekAvg > 0) {
    vsWeekAvg = Math.round(((todayStats.score - weekAvg) / weekAvg) * 100);
  }

  return {
    today: todayStats,
    yesterday: yesterdayStats,
    weekAvg,
    vsYesterday,
    vsWeekAvg,
  };
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

// ── Work Sessions ──

function getActiveWorkSession() {
  return getDb().prepare('SELECT * FROM work_sessions WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1').get() || null;
}

function startWorkSession() {
  const now = new Date();
  const date = localDateYmd();
  const started_at = now.toISOString();
  const info = getDb().prepare('INSERT INTO work_sessions (date, started_at) VALUES (?, ?)').run(date, started_at);
  return getDb().prepare('SELECT * FROM work_sessions WHERE id = ?').get(info.lastInsertRowid);
}

function stopWorkSession(id) {
  const session = getDb().prepare('SELECT * FROM work_sessions WHERE id = ?').get(id);
  if (!session || session.ended_at) return session;
  const now = new Date();
  const elapsed = Math.round((now.getTime() - new Date(session.started_at).getTime()) / 1000);
  getDb().prepare('UPDATE work_sessions SET ended_at = ?, elapsed = ? WHERE id = ?').run(now.toISOString(), elapsed, id);
  return getDb().prepare('SELECT * FROM work_sessions WHERE id = ?').get(id);
}

function getWorkSessionsByDate(date) {
  return getDb().prepare('SELECT * FROM work_sessions WHERE date = ? ORDER BY started_at ASC').all(date);
}

function getWorkTotalByDate(date) {
  const active = getDb().prepare('SELECT * FROM work_sessions WHERE date = ? AND ended_at IS NULL').get(date);
  const closedRow = getDb().prepare('SELECT COALESCE(SUM(elapsed), 0) as total FROM work_sessions WHERE date = ? AND ended_at IS NOT NULL').get(date);
  let total = closedRow.total;
  if (active) {
    total += Math.round((Date.now() - new Date(active.started_at).getTime()) / 1000);
  }
  return total;
}

function getWorkTotalByMonth(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return getDb().prepare(`
    SELECT date, SUM(elapsed) as total
    FROM work_sessions
    WHERE date >= ? AND date <= ? AND ended_at IS NOT NULL
    GROUP BY date
  `).all(start, end);
}

function normalizeDateYmd(value) {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIdList(value) {
  if (Array.isArray(value)) {
    return value
      .map(numberOrNull)
      .filter(id => id !== null);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        return parseIdList(JSON.parse(trimmed));
      } catch (_) {
        return [];
      }
    }
    return trimmed
      .split(',')
      .map(part => numberOrNull(part.trim()))
      .filter(id => id !== null);
  }

  const single = numberOrNull(value);
  return single === null ? [] : [single];
}

function normalizeTagsValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) {
    const filtered = value.map(tag => String(tag || '').trim()).filter(Boolean);
    return filtered.length > 0 ? JSON.stringify(filtered) : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return normalizeTagsValue(parsed);
      } catch (_) {
        return null;
      }
    }
    const parts = trimmed.split(',').map(tag => tag.trim()).filter(Boolean);
    return parts.length > 0 ? JSON.stringify(parts) : null;
  }

  return null;
}

function getProjectActualMinutesByDate(projectId, date) {
  const row = getDb().prepare(`
    SELECT COALESCE(SUM(actual_minutes), 0) AS total
    FROM tasks
    WHERE project_id = ?
      AND actual_minutes IS NOT NULL
      AND actual_minutes > 0
      AND DATE(completed_at) = ?
  `).get(projectId, date);
  return row?.total || 0;
}

function getWorkTotalMinutesByDate(date) {
  return Math.max(0, Math.round(getWorkTotalByDate(date) / 60));
}

function buildWorklogTimeSummary(projectId, workDate, payload = {}) {
  const taskActualMinutes = numberOrNull(payload.task_actual_minutes_override) ?? getProjectActualMinutesByDate(projectId, workDate);
  const globalWorkMinutes = numberOrNull(payload.global_work_minutes_override) ?? getWorkTotalMinutesByDate(workDate);
  const explicitTotalMinutes = numberOrNull(payload.time_summary_minutes);
  const manualAdjustMinutes = numberOrNull(payload.manual_adjust_minutes) ?? 0;

  let totalMinutes = 0;
  let source = 'none';

  if (explicitTotalMinutes !== null) {
    totalMinutes = Math.max(0, explicitTotalMinutes);
    source = taskActualMinutes > 0 || globalWorkMinutes > 0 ? 'mixed_manual_total' : 'manual_total';
  } else if (taskActualMinutes > 0) {
    totalMinutes = Math.max(0, taskActualMinutes + manualAdjustMinutes);
    source = manualAdjustMinutes !== 0 ? 'mixed_manual_adjusted' : 'task_actual';
  } else if (globalWorkMinutes > 0) {
    totalMinutes = Math.max(0, globalWorkMinutes + manualAdjustMinutes);
    source = manualAdjustMinutes !== 0 ? 'mixed_global_manual_adjusted' : 'global_work';
  } else if (manualAdjustMinutes !== 0) {
    totalMinutes = Math.max(0, manualAdjustMinutes);
    source = 'manual_estimate';
  }

  let note = '';
  if (source === 'task_actual') {
    note = `VDG 완료 태스크 actual_minutes 합산 기준 ${taskActualMinutes}분.`;
  } else if (source === 'mixed_manual_adjusted') {
    note = `VDG 완료 태스크 actual_minutes ${taskActualMinutes}분 + 수동 보정 ${manualAdjustMinutes}분.`;
  } else if (source === 'global_work') {
    note = `프로젝트별 실제시간 기록이 부족해 전역 작업시간 ${globalWorkMinutes}분을 참고값으로 사용.`;
  } else if (source === 'mixed_global_manual_adjusted') {
    note = `전역 작업시간 ${globalWorkMinutes}분 + 수동 보정 ${manualAdjustMinutes}분.`;
  } else if (source === 'mixed_manual_total') {
    note = `사용자 지정 총 ${totalMinutes}분. 참고 자동값: VDG 태스크 ${taskActualMinutes}분, 전역 작업 ${globalWorkMinutes}분.`;
  } else if (source === 'manual_total') {
    note = `사용자 지정 총 ${totalMinutes}분.`;
  } else if (source === 'manual_estimate') {
    note = `자동 집계가 없어 수동 추정 ${totalMinutes}분으로 기록.`;
  }

  return {
    totalMinutes,
    source,
    note,
    taskActualMinutes,
    globalWorkMinutes,
    manualAdjustMinutes,
  };
}

function getProjectWorklog(projectId, workDate) {
  const section = getSectionsByProject(projectId).find(entry => entry.section_type === HUB_SECTION_TYPES.WORKLOG) || null;
  if (!section) {
    return { section: null, items: [] };
  }

  const normalizedDate = normalizeDateYmd(workDate);
  const items = getItemsBySection(section.id)
    .map(item => {
      const meta = parseJsonSafe(item.metadata, {});
      return {
        ...item,
        section_id: section.id,
        section_title: section.title,
        section_type: section.section_type,
        worklog_meta: meta,
      };
    })
    .filter(item => !normalizedDate || item.worklog_meta.work_date === normalizedDate)
    .sort((a, b) => {
      const dateDiff = String(b.worklog_meta.work_date || '').localeCompare(String(a.worklog_meta.work_date || ''));
      if (dateDiff !== 0) return dateDiff;
      return String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''));
    });

  return { section, items };
}

function upsertWorklogEntry(projectId, payload = {}) {
  const section = ensureHubSection(projectId, HUB_SECTION_TYPES.WORKLOG);
  const workDate = normalizeDateYmd(payload.work_date) || localDateYmd();
  const explicitItemId = numberOrNull(payload.existing_item_id);
  const hasContentInput = Object.prototype.hasOwnProperty.call(payload, 'content') || Object.prototype.hasOwnProperty.call(payload, 'summary');
  const hasTagsInput = Object.prototype.hasOwnProperty.call(payload, 'tags');

  const existingById = explicitItemId
    ? getDb().prepare('SELECT * FROM section_items WHERE id = ? AND section_id = ?').get(explicitItemId, section.id)
    : null;
  const existingByDate = getProjectWorklog(projectId, workDate).items[0] || null;
  const existing = existingById || existingByDate;
  const existingMeta = parseJsonSafe(existing?.metadata, {});
  const timeSummary = buildWorklogTimeSummary(projectId, workDate, payload);
  const relatedTaskIds = parseIdList(payload.related_task_ids ?? existingMeta.related_task_ids ?? []);
  const relatedNoteIds = parseIdList(payload.related_note_ids ?? existingMeta.related_note_ids ?? []);
  const metadata = compactObject({
    ...existingMeta,
    work_date: workDate,
    time_summary_minutes: timeSummary.totalMinutes,
    time_source: timeSummary.source,
    time_note: String(payload.time_note || '').trim() || timeSummary.note || existingMeta.time_note || null,
    task_actual_minutes: timeSummary.taskActualMinutes,
    global_work_minutes: timeSummary.globalWorkMinutes,
    manual_adjust_minutes: timeSummary.manualAdjustMinutes || null,
    summary_source: String(payload.summary_source || '').trim() || existingMeta.summary_source || 'agent_daily_summary',
    related_task_ids: relatedTaskIds.length > 0 ? relatedTaskIds : null,
    related_note_ids: relatedNoteIds.length > 0 ? relatedNoteIds : null,
  });
  const fields = {
    title: String(payload.title || '').trim() || existing?.title || `${workDate} 작업일지`,
    content: hasContentInput
      ? (String(payload.content ?? payload.summary ?? '').trim() || null)
      : (existing?.content || null),
    tags: hasTagsInput
      ? normalizeTagsValue(payload.tags)
      : normalizeTagsValue(existing?.tags ?? null),
    metadata: JSON.stringify(metadata),
    sort_order: existing?.sort_order ?? getNextItemSortOrder(section.id),
  };

  const item = existing
    ? updateItem(existing.id, fields)
    : createItem({ section_id: section.id, ...fields });

  return { section, item, metadata };
}

module.exports = {
  getDb,
  getAllProjects,
  getProjectById,
  getProjectByName,
  createProject,
  deleteProject,
  getAllNotes,
  createNote,
  updateNote,
  deleteNote,
  getTasksByDate,
  getTodayTasks,
  getTasksByProject,
  getSubtasks,
  createTask,
  updateTask,
  deleteTask,
  getCompletedTasksByMonth,
  getSchedulesByDate,
  getSchedulesByMonth,
  getRecentScheduleTemplates,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getSectionsByProject,
  createSection,
  updateSection,
  deleteSection,
  getItemsBySection,
  getAllItemsByProject,
  createItem,
  updateItem,
  deleteItem,
  getMonthlySubscriptions,
  createMonthlySubscription,
  updateMonthlySubscription,
  deleteMonthlySubscription,
  getProjectHubData,
  captureHubItem,
  getEffortForDate,
  getEffortRange,
  getEffortStats,
  getActiveWorkSession,
  startWorkSession,
  stopWorkSession,
  getWorkSessionsByDate,
  getWorkTotalByDate,
  getWorkTotalByMonth,
  getProjectWorklog,
  upsertWorklogEntry,
  close,
};
