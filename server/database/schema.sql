-- LANLock Database Schema
-- SQLite database for exam proctoring

-- Students table: tracks connected students
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    name TEXT,
    ip_address TEXT,
    connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'offline',
    is_focused INTEGER DEFAULT 1,
    submitted_at DATETIME DEFAULT NULL
);

-- Answers table: stores student submissions
CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    question_id INTEGER NOT NULL,
    answer TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id),
    UNIQUE(student_id, question_id)
);

-- Exam state table: single row to track exam status
-- state: 'setup' | 'lobby' | 'active' | 'ended'
CREATE TABLE IF NOT EXISTS exam_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    state TEXT DEFAULT 'setup',
    is_active INTEGER DEFAULT 0,
    started_at DATETIME,
    ends_at DATETIME,
    exam_title TEXT,
    exam_rules TEXT,
    exit_code TEXT DEFAULT '1234',
    reg_password TEXT,
    eligible_students TEXT
);

-- Violations log: tracks focus loss and other violations
CREATE TABLE IF NOT EXISTS violations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    type TEXT NOT NULL,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- Initialize exam state with default row
INSERT OR IGNORE INTO exam_state (id, is_active) VALUES (1, 0);
