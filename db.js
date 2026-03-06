const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'fuara.db');

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
  if (schedCols.length > 0 && !schedCols.includes('recurrence_type')) {
    db.exec("ALTER TABLE schedules ADD COLUMN recurrence_type TEXT DEFAULT 'none'");
  }
  if (schedCols.length > 0 && !schedCols.includes('recurrence_days')) {
    db.exec("ALTER TABLE schedules ADD COLUMN recurrence_days TEXT");
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
      description TEXT,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
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

function createSchedule({ title, date, start_time, end_time, description, project_id, recurrence_type, recurrence_days }) {
  const resolvedDate = date || localDateYmd();
  const info = getDb().prepare(`
    INSERT INTO schedules (title, date, start_time, end_time, description, project_id, recurrence_type, recurrence_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, resolvedDate, start_time, end_time, description || null, project_id || null, recurrence_type || 'none', recurrence_days || null);
  return getDb().prepare(`
    SELECT s.*, p.name AS project_name
    FROM schedules s LEFT JOIN projects p ON s.project_id = p.id
    WHERE s.id = ?
  `).get(info.lastInsertRowid);
}

function updateSchedule(id, fields) {
  return genericUpdate('schedules', id, fields,
    ['title', 'date', 'start_time', 'end_time', 'description', 'project_id', 'alarm_enabled', 'recurrence_type', 'recurrence_days'],
    { returnQuery: `SELECT s.*, p.name AS project_name FROM schedules s LEFT JOIN projects p ON s.project_id = p.id WHERE s.id = ?` }
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

function createSection({ project_id, section_type, title, config, sort_order }) {
  const info = getDb().prepare(`
    INSERT INTO project_sections (project_id, section_type, title, config, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(project_id, section_type, title, config || null, sort_order || 0);
  return getDb().prepare('SELECT * FROM project_sections WHERE id = ?').get(info.lastInsertRowid);
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

module.exports = {
  getDb,
  getAllProjects,
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
  getEffortForDate,
  getEffortRange,
  getEffortStats,
  getActiveWorkSession,
  startWorkSession,
  stopWorkSession,
  getWorkSessionsByDate,
  getWorkTotalByDate,
  getWorkTotalByMonth,
  close,
};
