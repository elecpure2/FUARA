const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orbit', {
  // Projects
  getProjects: () => ipcRenderer.invoke('get-projects'),
  createProject: (data) => ipcRenderer.invoke('create-project', data),
  deleteProject: (id) => ipcRenderer.invoke('delete-project', id),

  // Notes
  getNotes: (projectId) => ipcRenderer.invoke('get-notes', projectId),
  createNote: (data) => ipcRenderer.invoke('create-note', data),
  updateNote: (id, fields) => ipcRenderer.invoke('update-note', id, fields),
  deleteNote: (id) => ipcRenderer.invoke('delete-note', id),

  // Tasks
  getTodayTasks: (projectId) => ipcRenderer.invoke('get-tasks-today', projectId),
  getTasksByDate: (date, projectId) => ipcRenderer.invoke('get-tasks-by-date', date, projectId),
  getTasksByProject: (projectId) => ipcRenderer.invoke('get-tasks-by-project', projectId),
  getSubtasks: (parentId) => ipcRenderer.invoke('get-subtasks', parentId),
  getCompletedByMonth: (year, month, projectId) => ipcRenderer.invoke('get-completed-by-month', year, month, projectId),
  createTask: (data) => ipcRenderer.invoke('create-task', data),
  updateTask: (id, fields) => ipcRenderer.invoke('update-task', id, fields),
  deleteTask: (id) => ipcRenderer.invoke('delete-task', id),

  // Schedules
  getSchedules: (date, projectId) => ipcRenderer.invoke('get-schedules', date, projectId),
  createSchedule: (data) => ipcRenderer.invoke('create-schedule', data),
  updateSchedule: (id, fields) => ipcRenderer.invoke('update-schedule', id, fields),
  deleteSchedule: (id) => ipcRenderer.invoke('delete-schedule', id),

  // Sections
  getSections: (projectId) => ipcRenderer.invoke('get-sections', projectId),
  createSection: (data) => ipcRenderer.invoke('create-section', data),
  updateSection: (id, fields) => ipcRenderer.invoke('update-section', id, fields),
  deleteSection: (id) => ipcRenderer.invoke('delete-section', id),

  // Section Items
  getItems: (sectionId) => ipcRenderer.invoke('get-items', sectionId),
  getAllItemsByProject: (projectId) => ipcRenderer.invoke('get-all-items-by-project', projectId),
  createItem: (data) => ipcRenderer.invoke('create-item', data),
  updateItem: (id, fields) => ipcRenderer.invoke('update-item', id, fields),
  deleteItem: (id) => ipcRenderer.invoke('delete-item', id),

  // Alarm
  selectAlarmSound: () => ipcRenderer.invoke('select-alarm-sound'),
  playYoutubeAlarm: (url) => ipcRenderer.invoke('play-youtube-alarm', url),
  stopYoutubeAlarm: () => ipcRenderer.invoke('stop-youtube-alarm'),

  // Events
  onTasksChanged: (callback) => {
    ipcRenderer.on('tasks-changed', callback);
    return () => ipcRenderer.removeListener('tasks-changed', callback);
  },
  onFocusNewTask: (callback) => {
    ipcRenderer.on('focus-new-task', callback);
    return () => ipcRenderer.removeListener('focus-new-task', callback);
  },
  onNotesChanged: (callback) => {
    ipcRenderer.on('notes-changed', callback);
    return () => ipcRenderer.removeListener('notes-changed', callback);
  },

  // Window controls
  showMain: () => ipcRenderer.send('show-main'),
  toggleSticker: () => ipcRenderer.send('toggle-sticker'),
  togglePin: () => ipcRenderer.invoke('toggle-sticker-pin'),
  onPinState: (callback) => {
    const handler = (_e, pinned) => callback(pinned);
    ipcRenderer.on('pin-state', handler);
    return () => ipcRenderer.removeListener('pin-state', handler);
  },

  // Effort
  getEffortStats: () => ipcRenderer.invoke('get-effort-stats'),
  getEffortCalendar: (year, month) => ipcRenderer.invoke('get-effort-calendar', year, month),

  // Calendar schedules
  getSchedulesByMonth: (year, month) => ipcRenderer.invoke('get-schedules-by-month', year, month),

  // Work Sessions
  workGetActive: () => ipcRenderer.invoke('work-get-active'),
  workStart: () => ipcRenderer.invoke('work-start'),
  workStop: (id) => ipcRenderer.invoke('work-stop', id),
  workSessionsByDate: (date) => ipcRenderer.invoke('work-sessions-by-date', date),
  workTotalByDate: (date) => ipcRenderer.invoke('work-total-by-date', date),
  workTotalByMonth: (year, month) => ipcRenderer.invoke('work-total-by-month', year, month),
});
