"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabaseClient";
import ReactMarkdown from "react-markdown";

type TeamMember = "maggi" | "kevdev" | "raulin" | "aaron";
type TaskStatus = "todo" | "in-progress" | "done";

interface Task {
  id: string;
  title: string;
  assignee: TeamMember;
  status: TaskStatus;
  objective?: string;
  solution?: string;
  timer_seconds?: number;
  timer_running?: boolean;
  timer_last_started_at?: string | null;
}

interface Note {
  id: string;
  author: TeamMember;
  content: string;
  isExpanded?: boolean;
}

const TEAM_MEMBERS: TeamMember[] = ["maggi", "kevdev", "raulin", "aaron"];

const TEAM_COLORS: Record<TeamMember, string> = {
  maggi: "rgba(236, 72, 153, 0.15)",
  kevdev: "rgba(59, 130, 246, 0.15)",
  raulin: "rgba(16, 185, 129, 0.15)",
  aaron: "rgba(245, 158, 11, 0.15)"
};

const TEAM_BORDER_COLORS: Record<TeamMember, string> = {
  maggi: "rgba(236, 72, 153, 0.4)",
  kevdev: "rgba(59, 130, 246, 0.4)",
  raulin: "rgba(16, 185, 129, 0.4)",
  aaron: "rgba(245, 158, 11, 0.4)"
};

const formatTime = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

function TimerDisplay({ seconds, isRunning, lastStartedAt }: { seconds: number, isRunning: boolean, lastStartedAt: string | null }) {
  const [displaySeconds, setDisplaySeconds] = useState(seconds);

  useEffect(() => {
    let interval: any;
    if (isRunning && lastStartedAt) {
      const start = new Date(lastStartedAt).getTime();
      interval = setInterval(() => {
        const now = new Date().getTime();
        const elapsed = Math.floor((now - start) / 1000);
        setDisplaySeconds(seconds + elapsed);
      }, 1000);
    } else {
      setDisplaySeconds(seconds);
    }
    return () => clearInterval(interval);
  }, [isRunning, lastStartedAt, seconds]);

  return <span>{formatTime(displaySeconds)}</span>;
}

export default function Home() {
  const [currentUser, setCurrentUser] = useState<TeamMember>("aaron");
  const [activeTab, setActiveTab] = useState<"board" | "notes">("board");
  
  // Board State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState<TeamMember>("aaron");
  const [newTaskObjective, setNewTaskObjective] = useState("");
  const [newTaskSolution, setNewTaskSolution] = useState("");
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  // Global Timer State
  const [globalTimer, setGlobalTimer] = useState({ seconds: 0, isRunning: false, lastStartedAt: null as string | null });
  const [isGlobalTimerFullscreen, setIsGlobalTimerFullscreen] = useState(false);

  // Notes State
  const [notes, setNotes] = useState<Note[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState("");

  useEffect(() => {
    async function loadTasks() {
      const { data, error } = await supabase.from('tasks').select('*');
      if (data && !error && data.length > 0) {
        setTasks(data);
      }
      setIsLoaded(true);
    }
    
    async function loadNotes() {
      const { data, error } = await supabase.from('notes').select('*');
      if (data && !error) {
        const parsedNotes: Note[] = data.map((row) => {
          let parsedContent = row.content;
          try {
            const parsed = JSON.parse(parsedContent);
            if (parsed.blocks) {
              parsedContent = `# ${parsed.title}\n\n` + parsed.blocks.map((b: any) => `**${b.author}**: ${b.content}`).join("\n\n");
            }
          } catch(e) {}
          return { id: row.id, author: row.author as TeamMember, content: parsedContent, isExpanded: false };
        });
        setNotes((prev) => parsedNotes.map((pn) => {
          const existing = prev.find((p) => p.id === pn.id);
          return { ...pn, isExpanded: existing ? existing.isExpanded : false };
        }));
      }
    }

    async function loadGlobalTimer() {
      const { data, error } = await supabase.from('global_timer').select('*').eq('id', 'main').single();
      if (data && !error) {
        setGlobalTimer({
          seconds: data.timer_seconds || 0,
          isRunning: data.timer_running || false,
          lastStartedAt: data.timer_last_started_at
        });
      }
    }

    loadTasks();
    loadNotes();
    loadGlobalTimer();

    const channel = supabase.channel('kanban-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => loadTasks())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, () => loadNotes())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'global_timer' }, () => loadGlobalTimer())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // --- Board Functions ---
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedTaskId(id);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const handleDrop = async (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    if (!draggedTaskId) return;

    // If dropped into done, automatically open edit modal to ask for solution
    const task = tasks.find(t => t.id === draggedTaskId);
    if (task && status === "done" && task.status !== "done") {
       openEditModal({ ...task, status: "done" });
    } else {
       setTasks((prev) => prev.map((t) => t.id === draggedTaskId ? { ...t, status } : t));
       await supabase.from('tasks').update({ status }).eq('id', draggedTaskId);
    }
    setDraggedTaskId(null);
  };

  const openNewTaskModal = () => {
    setEditingTask(null);
    setNewTaskTitle("");
    setNewTaskAssignee(currentUser);
    setNewTaskObjective("");
    setNewTaskSolution("");
    setIsModalOpen(true);
  };
  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setNewTaskTitle(task.title);
    setNewTaskAssignee(task.assignee);
    setNewTaskObjective(task.objective || "");
    setNewTaskSolution(task.solution || "");
    setIsModalOpen(true);
  };
  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
    setNewTaskTitle("");
    setNewTaskAssignee(currentUser);
    setNewTaskObjective("");
    setNewTaskSolution("");
  };
  
  const saveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    if (editingTask) {
      const updatedTask = { 
        ...editingTask, 
        title: newTaskTitle, 
        assignee: newTaskAssignee, 
        objective: newTaskObjective,
        solution: newTaskSolution,
        status: editingTask.status === "done" ? "done" as TaskStatus : editingTask.status
      };
      setTasks(tasks.map((t) => t.id === editingTask.id ? updatedTask : t));
      await supabase.from('tasks').update({ 
        title: newTaskTitle, 
        assignee: newTaskAssignee, 
        objective: newTaskObjective,
        solution: newTaskSolution,
        status: updatedTask.status
      }).eq('id', editingTask.id);
    } else {
      const newTask: Task = {
        id: Date.now().toString(),
        title: newTaskTitle,
        assignee: newTaskAssignee,
        status: "todo",
        objective: newTaskObjective,
        solution: newTaskSolution,
        timer_seconds: 0,
        timer_running: false,
        timer_last_started_at: null
      };
      setTasks([...tasks, newTask]);
      await supabase.from('tasks').insert([newTask]);
    }
    closeModal();
  };
  
  const deleteTask = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setTasks(tasks.filter((t) => t.id !== id));
    await supabase.from('tasks').delete().eq('id', id);
  };

  // --- Task Timers ---
  const toggleTaskTimer = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    const now = new Date().toISOString();
    let updates: any = {};
    if (task.timer_running) {
      const start = new Date(task.timer_last_started_at!).getTime();
      const elapsed = Math.floor((new Date().getTime() - start) / 1000);
      updates = { timer_running: false, timer_seconds: (task.timer_seconds || 0) + elapsed };
    } else {
      updates = { timer_running: true, timer_last_started_at: now };
    }
    
    setTasks(tasks.map(t => t.id === task.id ? { ...t, ...updates } : t));
    await supabase.from('tasks').update(updates).eq('id', task.id);
  };

  const resetTaskTimer = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    const updates = { timer_running: false, timer_seconds: 0, timer_last_started_at: null };
    setTasks(tasks.map(t => t.id === task.id ? { ...t, ...updates } : t));
    await supabase.from('tasks').update(updates).eq('id', task.id);
  };

  // --- Global Timer ---
  const toggleGlobalTimer = async () => {
    const now = new Date().toISOString();
    let updates: any = {};
    if (globalTimer.isRunning) {
      const start = new Date(globalTimer.lastStartedAt!).getTime();
      const elapsed = Math.floor((new Date().getTime() - start) / 1000);
      updates = { timer_running: false, timer_seconds: globalTimer.seconds + elapsed };
    } else {
      updates = { timer_running: true, timer_last_started_at: now };
    }
    setGlobalTimer({ ...globalTimer, isRunning: updates.timer_running, seconds: updates.timer_seconds || globalTimer.seconds, lastStartedAt: updates.timer_last_started_at || globalTimer.lastStartedAt });
    await supabase.from('global_timer').update(updates).eq('id', 'main');
  };

  const resetGlobalTimer = async () => {
    const updates = { timer_running: false, timer_seconds: 0, timer_last_started_at: null };
    setGlobalTimer({ seconds: 0, isRunning: false, lastStartedAt: null });
    await supabase.from('global_timer').update(updates).eq('id', 'main');
  };

  // --- Notes Functions ---
  const addNote = async () => {
    const newNote: Note = { id: Date.now().toString(), content: "New post-it note...\nSupports **Markdown**!", author: currentUser };
    setNotes([...notes, newNote]);
    setEditingNoteId(newNote.id);
    setEditingNoteContent(newNote.content);
    await supabase.from('notes').insert([newNote]);
  };
  const saveNoteEdit = async (id: string) => {
    if (!editingNoteContent.trim()) return setEditingNoteId(null);
    setNotes(notes.map(n => n.id === id ? { ...n, content: editingNoteContent } : n));
    setEditingNoteId(null);
    await supabase.from('notes').update({ content: editingNoteContent }).eq('id', id);
  };
  const deleteNote = async (id: string) => {
    setNotes(notes.filter((n) => n.id !== id));
    await supabase.from('notes').delete().eq('id', id);
  };
  const toggleExpandNote = (id: string) => {
    setNotes(notes.map(n => n.id === id ? { ...n, isExpanded: !n.isExpanded } : n));
  };

  const columns: { id: TaskStatus; title: string }[] = [
    { id: "todo", title: "To Do" },
    { id: "in-progress", title: "In Progress" },
    { id: "done", title: "Done" },
  ];

  return (
    <>
      {/* Fullscreen Global Timer Overlay */}
      {isGlobalTimerFullscreen && (
        <div className="global-timer-fullscreen" onDoubleClick={() => setIsGlobalTimerFullscreen(false)}>
          <div className="fullscreen-timer-text">
            <TimerDisplay seconds={globalTimer.seconds} isRunning={globalTimer.isRunning} lastStartedAt={globalTimer.lastStartedAt} />
          </div>
          <p>Double click anywhere to exit</p>
        </div>
      )}

      <main className="board-container">
        <header className="header">
          <h1>ScrumBoardHack</h1>
          <div className="header-actions">
            
            {/* Global Timer */}
            <div className="global-timer-section">
              <div 
                className="global-timer-display" 
                onDoubleClick={() => setIsGlobalTimerFullscreen(true)}
                title="Double click for fullscreen"
              >
                <TimerDisplay seconds={globalTimer.seconds} isRunning={globalTimer.isRunning} lastStartedAt={globalTimer.lastStartedAt} />
              </div>
              <div className="global-timer-controls">
                <button onClick={toggleGlobalTimer}>{globalTimer.isRunning ? '⏸' : '▶'}</button>
                <button onClick={resetGlobalTimer}>⏹</button>
              </div>
            </div>

            <div className="user-selector">
              <span>Viewing as:</span>
              <select 
                className="user-select-input"
                value={currentUser}
                onChange={(e) => setCurrentUser(e.target.value as TeamMember)}
              >
                {TEAM_MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="tabs">
              <button 
                className={`tab-btn ${activeTab === 'board' ? 'active' : ''}`}
                onClick={() => setActiveTab('board')}
              >
                Board
              </button>
              <button 
                className={`tab-btn ${activeTab === 'notes' ? 'active' : ''}`}
                onClick={() => setActiveTab('notes')}
              >
                Post-it Notes
              </button>
            </div>
            {activeTab === 'board' && (
              <button className="add-task-btn" onClick={openNewTaskModal}>
                + New Task
              </button>
            )}
          </div>
        </header>

        {activeTab === 'board' && (
          <div className="columns">
            {columns.map((col) => (
              <div key={col.id} className="column" onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, col.id)}>
                <div className="column-header">
                  <span className="column-title">{col.title}</span>
                  <span className="task-count">
                    {tasks.filter((t) => t.status === col.id).length}
                  </span>
                </div>
                <div className="task-list">
                  {tasks.filter((t) => t.status === col.id).map((task) => (
                    <div key={task.id} className="task-card" draggable onDragStart={(e) => handleDragStart(e, task.id)}>
                      <div className="task-header">
                        <div className="task-title">{task.title}</div>
                        <div className="task-actions">
                          <button className="icon-btn edit-btn" onClick={() => openEditModal(task)} title="Edit">✎</button>
                          <button className="icon-btn delete-btn" onClick={(e) => deleteTask(e, task.id)} title="Delete">✕</button>
                        </div>
                      </div>
                      
                      {task.objective && (
                        <div className="task-objective">
                          <strong>Objective:</strong> {task.objective}
                        </div>
                      )}
                      {task.status === 'done' && task.solution && (
                        <div className="task-solution">
                          <strong>Solution:</strong> {task.solution}
                        </div>
                      )}

                      <div className="task-footer">
                        <div className="task-timer-controls">
                          <span className="task-timer-display">
                            <TimerDisplay seconds={task.timer_seconds || 0} isRunning={task.timer_running || false} lastStartedAt={task.timer_last_started_at || null} />
                          </span>
                          <button onClick={(e) => toggleTaskTimer(e, task)}>{task.timer_running ? '⏸' : '▶'}</button>
                          <button onClick={(e) => resetTaskTimer(e, task)}>⏹</button>
                        </div>

                        <div className="assignee">
                          <div className="assignee-avatar" title={task.assignee} style={{ background: TEAM_BORDER_COLORS[task.assignee] || 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' }}>
                            {task.assignee.charAt(0).toUpperCase()}
                          </div>
                          {task.assignee}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="notes-wrapper">
            <div className="notes-header-bar">
              <h2>Global Post-it Notes</h2>
              <button className="add-task-btn" onClick={addNote}>+ New Note</button>
            </div>
            <div className="notes-grid">
              {notes.map(note => (
                <div 
                  key={note.id} 
                  className={`note-card ${note.isExpanded ? 'expanded' : ''}`}
                  style={{ backgroundColor: TEAM_COLORS[note.author], borderColor: TEAM_BORDER_COLORS[note.author] }}
                >
                  <div className="note-card-header">
                    <div className="note-author-badge" style={{ backgroundColor: TEAM_BORDER_COLORS[note.author] }}>
                      {note.author}
                    </div>
                    <div className="note-card-actions">
                      {editingNoteId !== note.id && (
                        <button className="icon-btn edit-btn" onClick={() => { setEditingNoteId(note.id); setEditingNoteContent(note.content); }} title="Edit Note">✎</button>
                      )}
                      <button className="icon-btn expand-btn" onClick={() => toggleExpandNote(note.id)} title="Expand/Minimize">
                        {note.isExpanded ? '⤓' : '⤢'}
                      </button>
                      <button className="icon-btn delete-btn" onClick={() => deleteNote(note.id)} title="Delete Note">✕</button>
                    </div>
                  </div>

                  <div className="note-card-body">
                    {editingNoteId === note.id ? (
                      <div className="note-edit-mode">
                        <textarea 
                          className="note-edit-textarea"
                          value={editingNoteContent}
                          onChange={(e) => setEditingNoteContent(e.target.value)}
                          autoFocus
                        />
                        <button className="add-task-btn save-note-btn" onClick={() => saveNoteEdit(note.id)}>Save</button>
                      </div>
                    ) : (
                      <div className="note-markdown-content">
                        <ReactMarkdown>{note.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isModalOpen && (
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>{editingTask ? "Edit Task" : "Add New Task"}</h2>
              <form onSubmit={saveTask}>
                <div className="form-group">
                  <label>Task Title</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="What needs to be done?"
                    autoFocus
                  />
                </div>
                
                <div className="form-group">
                  <label>Assignee</label>
                  <select
                    className="form-input"
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value as TeamMember)}
                  >
                    {TEAM_MEMBERS.map((member) => (
                      <option key={member} value={member}>
                        {member}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Objective</label>
                  <textarea
                    className="form-input"
                    value={newTaskObjective}
                    onChange={(e) => setNewTaskObjective(e.target.value)}
                    placeholder="What is the goal of this task?"
                    style={{ minHeight: '60px', resize: 'vertical' }}
                  />
                </div>

                {(editingTask?.status === 'done' || newTaskTitle !== "" /* wait, just show solution field if editing an existing task */) && (
                  <div className="form-group">
                    <label>Solution</label>
                    <textarea
                      className="form-input"
                      value={newTaskSolution}
                      onChange={(e) => setNewTaskSolution(e.target.value)}
                      placeholder="How was this solved? (Required for Done tasks)"
                      style={{ minHeight: '60px', resize: 'vertical' }}
                    />
                  </div>
                )}

                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-submit">
                    {editingTask ? "Save Changes" : "Add Task"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
