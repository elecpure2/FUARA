const express = require('express');
const cors = require('cors');
const db = require('./db');

const PORT = 7777;

function createServer(onTaskChange) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ── Projects ──

  app.get('/projects', (_req, res) => {
    res.json(db.getAllProjects());
  });

  app.post('/projects', (req, res) => {
    const { name, folder_path, tech_stack } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    try {
      const project = db.createProject({ name, folder_path, tech_stack });
      res.status(201).json(project);
    } catch (e) {
      if (e.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Project already exists' });
      }
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/projects/:id', (req, res) => {
    db.deleteProject(req.params.id);
    res.json({ ok: true });
  });

  // ── Notes ──

  app.get('/notes', (_req, res) => {
    res.json(db.getAllNotes());
  });

  app.post('/notes', (req, res) => {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    try {
      const note = db.createNote(req.body);
      if (onTaskChange) onTaskChange();
      res.status(201).json(note);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/notes/:id', (req, res) => {
    const note = db.updateNote(Number(req.params.id), req.body);
    if (!note) return res.status(404).json({ error: 'Note not found or no changes' });
    if (onTaskChange) onTaskChange();
    res.json(note);
  });

  app.delete('/notes/:id', (req, res) => {
    db.deleteNote(Number(req.params.id));
    if (onTaskChange) onTaskChange();
    res.json({ ok: true });
  });

  // ── Tasks ──

  app.get('/tasks/today', (_req, res) => {
    res.json(db.getTodayTasks());
  });

  app.get('/tasks', (req, res) => {
    const { date, project_id } = req.query;
    if (project_id) return res.json(db.getTasksByProject(project_id));
    if (date) return res.json(db.getTasksByDate(date));
    res.json(db.getTodayTasks());
  });

  app.post('/tasks', (req, res) => {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    try {
      const task = db.createTask(req.body);
      if (onTaskChange) onTaskChange();
      res.status(201).json(task);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/tasks/:id', (req, res) => {
    const task = db.updateTask(Number(req.params.id), req.body);
    if (!task) return res.status(404).json({ error: 'Task not found or no changes' });
    if (onTaskChange) onTaskChange();
    res.json(task);
  });

  app.delete('/tasks/:id', (req, res) => {
    db.deleteTask(Number(req.params.id));
    if (onTaskChange) onTaskChange();
    res.json({ ok: true });
  });

  // ── Schedules ──

  app.get('/schedules', (req, res) => {
    const { date, project_id } = req.query;
    if (!date) return res.status(400).json({ error: 'date is required' });
    res.json(db.getSchedulesByDate(date, project_id));
  });

  app.post('/schedules', (req, res) => {
    const { title, start_time, end_time } = req.body;
    if (!title || !start_time || !end_time) return res.status(400).json({ error: 'title, start_time, end_time required' });
    try {
      const schedule = db.createSchedule(req.body);
      if (onTaskChange) onTaskChange();
      res.status(201).json(schedule);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/schedules/:id', (req, res) => {
    const schedule = db.updateSchedule(Number(req.params.id), req.body);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found or no changes' });
    if (onTaskChange) onTaskChange();
    res.json(schedule);
  });

  app.delete('/schedules/:id', (req, res) => {
    db.deleteSchedule(Number(req.params.id));
    if (onTaskChange) onTaskChange();
    res.json({ ok: true });
  });

  // ── Project Sections ──

  app.get('/projects/:id/sections', (req, res) => {
    res.json(db.getSectionsByProject(Number(req.params.id)));
  });

  app.post('/projects/:id/sections', (req, res) => {
    const { section_type, title } = req.body;
    if (!section_type || !title) return res.status(400).json({ error: 'section_type and title are required' });
    try {
      const section = db.createSection({ ...req.body, project_id: Number(req.params.id) });
      if (onTaskChange) onTaskChange();
      res.status(201).json(section);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/sections/:id', (req, res) => {
    const section = db.updateSection(Number(req.params.id), req.body);
    if (!section) return res.status(404).json({ error: 'Section not found or no changes' });
    if (onTaskChange) onTaskChange();
    res.json(section);
  });

  app.delete('/sections/:id', (req, res) => {
    db.deleteSection(Number(req.params.id));
    if (onTaskChange) onTaskChange();
    res.json({ ok: true });
  });

  // ── Section Items ──

  app.get('/sections/:id/items', (req, res) => {
    res.json(db.getItemsBySection(Number(req.params.id)));
  });

  app.post('/sections/:id/items', (req, res) => {
    try {
      const item = db.createItem({ ...req.body, section_id: Number(req.params.id) });
      if (onTaskChange) onTaskChange();
      res.status(201).json(item);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/items/:id', (req, res) => {
    const item = db.updateItem(Number(req.params.id), req.body);
    if (!item) return res.status(404).json({ error: 'Item not found or no changes' });
    if (onTaskChange) onTaskChange();
    res.json(item);
  });

  app.delete('/items/:id', (req, res) => {
    db.deleteItem(Number(req.params.id));
    if (onTaskChange) onTaskChange();
    res.json({ ok: true });
  });

  app.get('/projects/:id/items/export', (req, res) => {
    const projectId = Number(req.params.id);
    const sections = db.getSectionsByProject(projectId);
    const format = req.query.format || 'markdown';

    const result = sections.map(sec => {
      const items = db.getItemsBySection(sec.id);
      return { ...sec, items };
    });

    if (format === 'json') return res.json(result);

    let md = '';
    for (const sec of result) {
      md += `# ${sec.title}\n\n`;
      if (sec.section_type === 'reference_doc') {
        for (const item of sec.items) {
          md += item.content ? `${item.content}\n\n` : '';
        }
      } else {
        for (const item of sec.items) {
          const tags = item.tags ? JSON.parse(item.tags).join(', ') : '';
          md += `## ${item.title || '(untitled)'}`;
          if (tags) md += `  [${tags}]`;
          md += '\n';
          if (item.content) md += `${item.content}\n`;
          md += '\n';
        }
      }
    }
    res.type('text/markdown; charset=utf-8').send(md);
  });

  // ── Health ──

  app.get('/ping', (_req, res) => {
    res.json({ status: 'ok', app: 'fuara' });
  });

  // Effort
  app.get('/effort/today', (_req, res) => {
    res.json(db.getEffortStats());
  });

  app.get('/effort/calendar/:year/:month', (req, res) => {
    const year = Number(req.params.year);
    const month = Number(req.params.month);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    res.json(db.getEffortRange(start, end));
  });

  // Work Sessions
  app.get('/work/today', (_req, res) => {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    res.json({ date, total: db.getWorkTotalByDate(date), sessions: db.getWorkSessionsByDate(date) });
  });

  app.get('/work/calendar/:year/:month', (req, res) => {
    res.json(db.getWorkTotalByMonth(Number(req.params.year), Number(req.params.month)));
  });

  return app;
}

function startServer(onTaskChange) {
  const app = createServer(onTaskChange);
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, '127.0.0.1', () => {
      console.log(`[FUARA] API server running at http://127.0.0.1:${PORT}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

module.exports = { startServer, PORT };
