/**
 * LANLock Database Initialization
 * SQLite database setup with sql.js (pure JavaScript)
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

let db = null;
let SQL = null;

/**
 * Initialize the database connection and create tables
 */
async function init() {
    // Ensure data directory exists
    const dataDir = path.dirname(config.DB_PATH);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize SQL.js
    SQL = await initSqlJs();

    // Load existing database or create new one
    if (fs.existsSync(config.DB_PATH)) {
        const buffer = fs.readFileSync(config.DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    // Run migrations for existing databases
    migrateDatabase();

    // Save database
    saveDatabase();

    console.log('✓ Database initialized at:', config.DB_PATH);
    return db;
}

/**
 * Run migrations to add missing columns to existing databases
 */
function migrateDatabase() {
    // Check if reg_password column exists in exam_state
    try {
        const columns = all("PRAGMA table_info(exam_state)");
        const columnNames = columns.map(c => c.name);

        // Add reg_password if missing
        if (!columnNames.includes('reg_password')) {
            console.log('Migrating: Adding reg_password column to exam_state');
            db.run('ALTER TABLE exam_state ADD COLUMN reg_password TEXT');
        }

        // Add eligible_students if missing
        if (!columnNames.includes('eligible_students')) {
            console.log('Migrating: Adding eligible_students column to exam_state');
            db.run('ALTER TABLE exam_state ADD COLUMN eligible_students TEXT');
        }

        // Add exit_code if missing
        if (!columnNames.includes('exit_code')) {
            console.log('Migrating: Adding exit_code column to exam_state');
            db.run("ALTER TABLE exam_state ADD COLUMN exit_code TEXT DEFAULT '1234'");
        }
    } catch (err) {
        console.error('Migration error (exam_state):', err.message);
    }

    // Check students table for submitted_at column
    try {
        const studentColumns = all("PRAGMA table_info(students)");
        const studentColumnNames = studentColumns.map(c => c.name);

        // Add submitted_at if missing
        if (!studentColumnNames.includes('submitted_at')) {
            console.log('Migrating: Adding submitted_at column to students');
            db.run('ALTER TABLE students ADD COLUMN submitted_at DATETIME DEFAULT NULL');
        }
    } catch (err) {
        console.error('Migration error (students):', err.message);
    }
}

/**
 * Save database to file
 */
function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(config.DB_PATH, buffer);
    }
}

/**
 * Get the database instance
 */
function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call init() first.');
    }
    return db;
}

/**
 * Close the database connection
 */
function close() {
    if (db) {
        saveDatabase();
        db.close();
        db = null;
        console.log('Database connection closed');
    }
}

// Helper function to run queries
function run(sql, params = []) {
    try {
        db.run(sql, params);
        saveDatabase();
        return { changes: db.getRowsModified() };
    } catch (err) {
        console.error('SQL Error:', err.message);
        throw err;
    }
}

function get(sql, params = []) {
    try {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
        }
        stmt.free();
        return null;
    } catch (err) {
        console.error('SQL Error:', err.message);
        throw err;
    }
}

function all(sql, params = []) {
    try {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) {
            rows.push(stmt.getAsObject());
        }
        stmt.free();
        return rows;
    } catch (err) {
        console.error('SQL Error:', err.message);
        throw err;
    }
}

// Student operations
const students = {
    upsert: (id, name, ipAddress) => {
        const existing = get('SELECT id FROM students WHERE id = ?', [id]);
        if (existing) {
            run(`
                UPDATE students SET
                    name = ?,
                    ip_address = ?,
                    last_heartbeat = datetime('now'),
                    status = 'online'
                WHERE id = ?
            `, [name, ipAddress, id]);
        } else {
            run(`
                INSERT INTO students (id, name, ip_address, connected_at, last_heartbeat, status, is_focused)
                VALUES (?, ?, ?, datetime('now'), datetime('now'), 'online', 1)
            `, [id, name, ipAddress]);
        }
        return { changes: 1 };
    },

    updateHeartbeat: (id, isFocused) => {
        return run(`
            UPDATE students 
            SET last_heartbeat = datetime('now'), 
                status = 'online',
                is_focused = ?
            WHERE id = ?
        `, [isFocused ? 1 : 0, id]);
    },

    setOffline: (id) => {
        return run(`
            UPDATE students SET status = 'offline', is_focused = 0 WHERE id = ?
        `, [id]);
    },

    markStaleOffline: (timeoutMs) => {
        const timeoutSec = timeoutMs / 1000;
        return run(`
            UPDATE students 
            SET status = 'offline', is_focused = 0
            WHERE status = 'online' 
            AND (julianday('now') - julianday(last_heartbeat)) * 86400 > ?
        `, [timeoutSec]);
    },

    getAll: () => {
        return all('SELECT * FROM students ORDER BY name');
    },

    getById: (id) => {
        return get('SELECT * FROM students WHERE id = ?', [id]);
    },

    getStats: () => {
        return get(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online,
                SUM(CASE WHEN status = 'online' AND is_focused = 1 THEN 1 ELSE 0 END) as focused,
                SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline,
                SUM(CASE WHEN submitted_at IS NOT NULL THEN 1 ELSE 0 END) as submitted
            FROM students
        `) || { total: 0, online: 0, focused: 0, offline: 0, submitted: 0 };
    },

    submit: (id) => {
        return run(`
            UPDATE students SET submitted_at = datetime('now') WHERE id = ?
        `, [id]);
    },

    clearSubmissions: () => {
        return run('UPDATE students SET submitted_at = NULL');
    },

    clearAll: () => {
        return run('DELETE FROM students');
    }
};

// Answer operations
const answers = {
    save: (studentId, questionId, answer) => {
        const existing = get(
            'SELECT id FROM answers WHERE student_id = ? AND question_id = ?',
            [studentId, questionId]
        );
        if (existing) {
            return run(`
                UPDATE answers SET answer = ?, submitted_at = datetime('now')
                WHERE student_id = ? AND question_id = ?
            `, [answer, studentId, questionId]);
        } else {
            return run(`
                INSERT INTO answers (student_id, question_id, answer, submitted_at)
                VALUES (?, ?, ?, datetime('now'))
            `, [studentId, questionId, answer]);
        }
    },

    getByStudent: (studentId) => {
        return all(`
            SELECT question_id, answer, submitted_at 
            FROM answers WHERE student_id = ?
        `, [studentId]);
    },

    getAll: () => {
        return all(`
            SELECT student_id, question_id, answer, submitted_at 
            FROM answers ORDER BY student_id, question_id
        `);
    }
};

// Exam state operations
// States: 'setup' → 'lobby' → 'active' → 'ended'
const examState = {
    get: () => {
        return get('SELECT * FROM exam_state WHERE id = 1') || {
            id: 1,
            state: 'setup',
            is_active: 0,
            reg_password: null,
            eligible_students: null
        };
    },

    // Open lobby - students can connect and see rules
    openLobby: (examTitle, examRules, exitCode, regPassword, eligibleStudents) => {
        return run(`
            UPDATE exam_state 
            SET state = 'lobby',
                is_active = 0,
                exam_title = ?,
                exam_rules = ?,
                exit_code = ?,
                reg_password = ?,
                eligible_students = ?,
                started_at = NULL,
                ends_at = NULL
            WHERE id = 1
        `, [examTitle, examRules, exitCode || '1234', regPassword, eligibleStudents]);
    },

    // Start exam - transition from lobby to active
    start: (durationMinutes) => {
        return run(`
            UPDATE exam_state 
            SET state = 'active',
                is_active = 1, 
                started_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                ends_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+' || ? || ' minutes')
            WHERE id = 1
        `, [durationMinutes]);
    },

    // Stop exam - transition to ended
    stop: () => {
        return run(`
            UPDATE exam_state 
            SET state = 'ended',
                is_active = 0 
            WHERE id = 1
        `);
    },

    // Reset to setup state
    reset: () => {
        return run(`
            UPDATE exam_state 
            SET state = 'setup',
                is_active = 0,
                started_at = NULL,
                ends_at = NULL,
                exam_title = NULL,
                exam_rules = NULL,
                reg_password = NULL,
                eligible_students = NULL
            WHERE id = 1
        `);
    }
};

// Violations operations
const violations = {
    log: (studentId, type, details = null) => {
        return run(`
            INSERT INTO violations (student_id, type, details, timestamp)
            VALUES (?, ?, ?, datetime('now'))
        `, [studentId, type, details]);
    },

    getByStudent: (studentId) => {
        return all(`
            SELECT * FROM violations WHERE student_id = ? ORDER BY timestamp DESC
        `, [studentId]);
    },

    getAll: () => {
        return all(`
            SELECT * FROM violations ORDER BY timestamp DESC
        `);
    },

    getCount: () => {
        return get('SELECT COUNT(*) as count FROM violations') || { count: 0 };
    }
};

module.exports = {
    init,
    getDb,
    close,
    saveDatabase,
    students,
    answers,
    examState,
    violations
};
