/**
 * LANLock API Routes
 * REST API endpoints for exam operations
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../database/init');
const socketService = require('../services/socket');
const config = require('../config');

// Load exam data
let examData = null;

function loadExamData() {
    const examPath = path.join(config.DATA_DIR, 'exam_data.json');
    if (fs.existsSync(examPath)) {
        examData = JSON.parse(fs.readFileSync(examPath, 'utf-8'));
    }
    return examData;
}

// GET /api/exam - Get exam questions (without answers for students)
router.get('/exam', (req, res) => {
    const data = loadExamData();

    if (!data) {
        return res.status(404).json({ error: 'Exam data not found' });
    }

    // Remove answers from questions for student view
    const sanitizedQuestions = data.questions.map(q => {
        const { answer, ...rest } = q;
        return rest;
    });

    res.json({
        exam_info: data.exam_info,
        questions: sanitizedQuestions
    });
});

// GET /api/exam/full - Get full exam data (instructor only)
router.get('/exam/full', (req, res) => {
    const data = loadExamData();

    if (!data) {
        return res.status(404).json({ error: 'Exam data not found' });
    }

    res.json(data);
});

// GET /api/exam/state - Get current exam state
router.get('/exam/state', (req, res) => {
    const state = db.examState.get();
    res.json(state);
});

// POST /api/exam/control - Control exam state
// Actions: open_lobby, start, stop, reset
router.post('/exam/control', (req, res) => {
    const { action, duration_minutes, exam_title, exam_rules, exit_code } = req.body;

    if (action === 'open_lobby') {
        // Open lobby for students to connect
        const title = exam_title || 'Exam';
        const rules = exam_rules || 'Please wait for the exam to begin.';
        const code = exit_code || '1234';

        db.examState.openLobby(title, rules, code);
        const state = db.examState.get();

        socketService.broadcastExamState(state);

        console.log(`[Exam] Lobby opened: ${title}, exit code: ${code}`);
        res.json({ success: true, state });

    } else if (action === 'start') {
        const currentState = db.examState.get();
        if (currentState.state !== 'lobby') {
            return res.status(400).json({ error: 'Must open lobby before starting exam' });
        }

        const data = loadExamData();
        const duration = duration_minutes || data?.exam_info?.duration_minutes || 60;

        db.examState.start(duration);
        const state = db.examState.get();

        socketService.broadcastExamState(state);

        console.log(`[Exam] Started with duration: ${duration} minutes`);
        res.json({ success: true, state });

    } else if (action === 'stop') {
        db.examState.stop();
        const state = db.examState.get();

        socketService.broadcastExamState(state);

        console.log('[Exam] Stopped');
        res.json({ success: true, state });

    } else if (action === 'reset') {
        db.examState.reset();
        const state = db.examState.get();

        socketService.broadcastExamState(state);

        console.log('[Exam] Reset to setup');
        res.json({ success: true, state });

    } else {
        res.status(400).json({ error: 'Invalid action. Use "open_lobby", "start", "stop", or "reset".' });
    }
});

// POST /api/answer - Save student answer
router.post('/answer', (req, res) => {
    const { student_id, question_id, answer } = req.body;

    if (!student_id || question_id === undefined) {
        return res.status(400).json({ error: 'student_id and question_id are required' });
    }

    try {
        const answerStr = typeof answer === 'object' ? JSON.stringify(answer) : String(answer);
        db.answers.save(student_id, question_id, answerStr);

        res.json({ success: true, message: 'Answer saved' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/answers/bulk - Save multiple answers at once
router.post('/answers/bulk', (req, res) => {
    const { student_id, answers } = req.body;

    if (!student_id || !Array.isArray(answers)) {
        return res.status(400).json({ error: 'student_id and answers array are required' });
    }

    try {
        for (const { question_id, answer } of answers) {
            const answerStr = typeof answer === 'object' ? JSON.stringify(answer) : String(answer);
            db.answers.save(student_id, question_id, answerStr);
        }

        res.json({ success: true, message: `${answers.length} answers saved` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/answers/:student_id - Get answers for a student
router.get('/answers/:student_id', (req, res) => {
    const { student_id } = req.params;
    const answers = db.answers.getByStudent(student_id);
    res.json(answers);
});

// GET /api/students - Get all students with status
router.get('/students', (req, res) => {
    const data = socketService.getStudentListData();
    res.json(data);
});

// GET /api/violations - Get all violations
router.get('/violations', (req, res) => {
    const violations = db.violations.getAll();
    res.json(violations);
});

// GET /api/violations/:student_id - Get violations for a student
router.get('/violations/:student_id', (req, res) => {
    const { student_id } = req.params;
    const violations = db.violations.getByStudent(student_id);
    res.json(violations);
});

// GET /api/results - Get all student answers (for grading)
router.get('/results', (req, res) => {
    const answers = db.answers.getAll();
    const students = db.students.getAll();

    // Group answers by student
    const results = {};
    for (const student of students) {
        results[student.id] = {
            name: student.name,
            answers: []
        };
    }

    for (const answer of answers) {
        if (results[answer.student_id]) {
            results[answer.student_id].answers.push({
                question_id: answer.question_id,
                answer: answer.answer,
                submitted_at: answer.submitted_at
            });
        }
    }

    res.json(results);
});

// POST /api/shutdown - Shutdown the server
router.post('/shutdown', (req, res) => {
    console.log('[Server] Shutdown requested from dashboard');

    // Send response before shutting down
    res.json({ success: true, message: 'Server shutting down...' });

    // Stop exam if running
    db.examState.stop();

    // Broadcast shutdown to all clients
    const io = socketService.getIo();
    if (io) {
        io.emit('server:shutdown', { message: 'Server is shutting down' });
    }

    // Give time for response and broadcasts to complete
    setTimeout(() => {
        console.log('[Server] Goodbye!');
        process.exit(0);
    }, 1000);
});

module.exports = router;
