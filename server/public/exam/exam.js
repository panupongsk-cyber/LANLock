/**
 * LANLock Exam - JavaScript
 * Student exam interface with real-time connection
 */

// State
let socket = null;
let studentId = null;
let studentName = null;
let examData = null;
let currentQuestion = 0;
let answers = {};
let timerInterval = null;
let autoSaveInterval = null;

// DOM Elements
const elements = {
    loginScreen: document.getElementById('loginScreen'),
    waitingScreen: document.getElementById('waitingScreen'),
    examScreen: document.getElementById('examScreen'),
    loginForm: document.getElementById('loginForm'),
    studentIdInput: document.getElementById('studentId'),
    studentNameInput: document.getElementById('studentName'),
    loginError: document.getElementById('loginError'),
    examTitle: document.getElementById('examTitle'),
    examTimer: document.getElementById('examTimer'),
    studentBadge: document.getElementById('studentBadge'),
    questionList: document.getElementById('questionList'),
    questionContent: document.getElementById('questionContent'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    connectionIndicator: document.getElementById('connectionIndicator'),
    submitModal: document.getElementById('submitModal')
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Check if running in kiosk mode (has lanlock API)
    if (window.lanlock && window.lanlock.getConfig) {
        try {
            const config = await window.lanlock.getConfig();
            if (config.student_id) {
                console.log('Kiosk mode detected, auto-login as:', config.student_id);

                // Set values and auto-login
                elements.studentIdInput.value = config.student_id;
                elements.studentNameInput.value = config.student_name || config.student_id;

                // Trigger login
                studentId = config.student_id;
                studentName = config.student_name || config.student_id;

                // Save to session
                sessionStorage.setItem('studentId', studentId);
                sessionStorage.setItem('studentName', studentName);

                // Skip login, show waiting
                showScreen('waiting');
                initSocket();

                // Register with main process
                window.lanlock.registerStudent(studentId, studentName);
                return;
            }
        } catch (err) {
            console.log('Not in kiosk mode or error:', err);
        }
    }

    // Normal mode: Check for saved session
    const savedId = sessionStorage.getItem('studentId');
    const savedName = sessionStorage.getItem('studentName');
    if (savedId) {
        elements.studentIdInput.value = savedId;
        elements.studentNameInput.value = savedName || '';
    }
});

// Login
function login(event) {
    event.preventDefault();

    studentId = elements.studentIdInput.value.trim();
    studentName = elements.studentNameInput.value.trim() || studentId;

    if (!studentId) {
        showError('Please enter your Student ID');
        return;
    }

    // Save to session
    sessionStorage.setItem('studentId', studentId);
    sessionStorage.setItem('studentName', studentName);

    // Show waiting screen
    showScreen('waiting');

    // Connect to server
    initSocket();
}

// Socket.io connection
function initSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('Connected to server');
        updateConnectionStatus(true);

        // Register as student
        socket.emit('student:connect', {
            student_id: studentId,
            name: studentName
        });

        // Start heartbeat
        startHeartbeat();

        // Check exam state
        checkExamState();
    });

    socket.on('connect_error', (error) => {
        console.log('Connection error:', error);
        updateConnectionStatus(false);
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        updateConnectionStatus(false);
    });

    socket.on('exam:state', (state) => {
        handleExamState(state);
    });

    socket.on('connect_error', () => {
        showError('Cannot connect to server. Please check your network.');
    });
}

// Check exam state
async function checkExamState() {
    try {
        updateConnectionStatus(false, 'Connecting...');

        // Use AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const res = await fetch('/api/exam/state', { signal: controller.signal });
        clearTimeout(timeoutId);

        const state = await res.json();
        updateConnectionStatus(true);
        handleExamState(state);
    } catch (err) {
        console.error('Failed to check exam state:', err);
        updateConnectionStatus(false, 'Waiting for Server...');
        // Retry after a delay
        setTimeout(checkExamState, 3000);
    }
}

// Handle exam state changes
// States: 'setup' | 'lobby' | 'active' | 'ended'
function handleExamState(state) {
    const examMode = state.state || 'setup';

    switch (examMode) {
        case 'setup':
            // Not ready yet, show waiting
            showWaitingScreen('Connecting...', 'Please wait for the exam to be set up.');
            break;

        case 'lobby':
            // Show lobby with rules
            showLobbyScreen(state.exam_title, state.exam_rules);
            break;

        case 'active':
            // Exam is running, load questions
            loadExam();
            break;

        case 'ended':
            // Exam has ended - show end screen and auto-exit
            showExamEndedScreen();
            break;

        default:
            // Fallback for legacy is_active check
            if (state.is_active) {
                loadExam();
            } else {
                showWaitingScreen('Waiting...', 'Please wait for the exam to start.');
            }
    }
}

// Show waiting screen with custom message
function showWaitingScreen(title, message) {
    elements.waitingScreen.innerHTML = `
        <div class="waiting-card">
            <div class="waiting-icon">⏳</div>
            <h2>${title || 'Waiting for Exam to Start'}</h2>
            <p>${message || 'The instructor will start the exam shortly.'}</p>
            <div class="loading-dots">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    showScreen('waiting');
}

// Show lobby screen with exam title and rules
function showLobbyScreen(title, rules) {
    const formattedRules = (rules || 'Please wait for the exam to begin.').replace(/\n/g, '<br>');

    elements.waitingScreen.innerHTML = `
        <div class="waiting-card lobby-card">
            <div class="waiting-icon">📋</div>
            <h2>${title || 'Exam'}</h2>
            <div class="lobby-rules">
                <h3>Instructions</h3>
                <p>${formattedRules}</p>
            </div>
            <div class="lobby-status">
                <div class="status-ready">✓ You are ready</div>
                <p>Waiting for instructor to start the exam...</p>
                <div class="loading-dots">
                    <span></span><span></span><span></span>
                </div>
            </div>
        </div>
    `;
    showScreen('waiting');
}

// Show exam ended screen with auto-exit for kiosk mode
function showExamEndedScreen() {
    document.getElementById('app').innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: linear-gradient(135deg, #0f0f1a, #1a1a2e);
            color: white;
            font-family: system-ui, sans-serif;
            text-align: center;
            padding: 20px;
        ">
            <div style="font-size: 5rem; margin-bottom: 20px;">📋</div>
            <h1 style="font-size: 2.5rem; margin-bottom: 10px; color: #667eea;">Exam Ended</h1>
            <p style="font-size: 1.2rem; color: #a0a0b0; margin-bottom: 10px;">
                The exam session has been ended by the instructor.
            </p>
            <p style="font-size: 1rem; color: #666;">
                Thank you for participating.
            </p>
            <div id="autoExitCountdown" style="
                margin-top: 40px;
                padding: 15px 30px;
                background: rgba(255,255,255,0.05);
                border-radius: 10px;
                font-size: 0.9rem;
                color: #888;
            ">
                Closing in <span id="countdown">5</span> seconds...
            </div>
        </div>
    `;

    // Auto-exit for kiosk mode
    if (window.lanlock && window.lanlock.forceQuit) {
        let seconds = 5;
        const countdownEl = document.getElementById('countdown');

        const interval = setInterval(() => {
            seconds--;
            if (countdownEl) countdownEl.textContent = seconds;

            if (seconds <= 0) {
                clearInterval(interval);
                window.lanlock.forceQuit();
            }
        }, 1000);
    } else {
        // Not in kiosk mode
        const countdownDiv = document.getElementById('autoExitCountdown');
        if (countdownDiv) {
            countdownDiv.innerHTML = 'You may close this window now.';
        }
    }
}

// Load exam
async function loadExam() {
    try {
        // Fetch exam data
        const res = await fetch('/api/exam');
        examData = await res.json();

        // Fetch previous answers
        await loadAnswers();

        // Setup UI
        setupExamUI();

        // Show exam screen
        showScreen('exam');

        // Start timer
        const stateRes = await fetch('/api/exam/state');
        const state = await stateRes.json();
        console.log('Exam state:', state);
        console.log('ends_at:', state.ends_at);

        if (state.ends_at) {
            startTimer(state.ends_at);
        } else {
            console.warn('No ends_at in exam state');
            elements.examTimer.textContent = 'No limit';
        }

        // Start auto-save
        startAutoSave();

    } catch (err) {
        console.error('Failed to load exam:', err);
        showError('Failed to load exam data');
    }
}

// Load previous answers
async function loadAnswers() {
    try {
        const res = await fetch(`/api/answers/${studentId}`);
        const data = await res.json();

        for (const ans of data) {
            answers[ans.question_id] = ans.answer;
        }
    } catch (err) {
        console.error('Failed to load answers:', err);
    }
}

// Setup exam UI
function setupExamUI() {
    // Set title
    elements.examTitle.textContent = examData.exam_info?.title || 'Exam';
    elements.studentBadge.textContent = `👤 ${studentName} (${studentId})`;

    // Build question navigation
    buildQuestionNav();

    // Show first question
    showQuestion(0);
}

// Build question navigation
function buildQuestionNav() {
    elements.questionList.innerHTML = examData.questions.map((q, i) => {
        const answered = answers[q.id] !== undefined;
        return `
            <button 
                class="question-btn ${i === 0 ? 'current' : ''} ${answered ? 'answered' : ''}"
                onclick="goToQuestion(${i})"
                data-index="${i}"
            >
                ${i + 1}
            </button>
        `;
    }).join('');
}

// Go to question
function goToQuestion(index) {
    // Save current answer first
    saveCurrentAnswerSilent();

    // Update navigation
    const buttons = elements.questionList.querySelectorAll('.question-btn');
    buttons.forEach((btn, i) => {
        btn.classList.toggle('current', i === index);
    });

    currentQuestion = index;
    showQuestion(index);
    updateNavButtons();
}

// Show question
function showQuestion(index) {
    const question = examData.questions[index];
    if (!question) return;

    let html = `
        <div class="question-header">
            <span class="question-number">Question ${index + 1} of ${examData.questions.length}</span>
            <span class="question-type">${formatType(question.type)}</span>
        </div>
        <div class="question-text">${escapeHtml(question.text)}</div>
        <div class="question-score">Points: ${question.score}</div>
    `;

    const savedAnswer = answers[question.id];

    switch (question.type) {
        case 'multiple_choice':
            html += renderMultipleChoice(question, savedAnswer);
            break;
        case 'short_answer':
            html += renderShortAnswer(question, savedAnswer);
            break;
        case 'coding':
            html += renderCoding(question, savedAnswer);
            break;
    }

    elements.questionContent.innerHTML = html;
}

// Render multiple choice
function renderMultipleChoice(question, savedAnswer) {
    return `
        <div class="options-list">
            ${question.options.map((opt, i) => `
                <label class="option-item ${savedAnswer === opt ? 'selected' : ''}" onclick="selectOption(this, ${question.id}, '${escapeHtml(opt)}')">
                    <input type="radio" name="q${question.id}" value="${escapeHtml(opt)}" ${savedAnswer === opt ? 'checked' : ''}>
                    <span class="option-radio"></span>
                    <span class="option-text">${escapeHtml(opt)}</span>
                </label>
            `).join('')}
        </div>
    `;
}

// Render short answer
function renderShortAnswer(question, savedAnswer) {
    return `
        <textarea 
            class="short-answer-input" 
            id="answer-${question.id}"
            placeholder="Type your answer here..."
            oninput="updateAnswer(${question.id}, this.value)"
        >${savedAnswer || ''}</textarea>
    `;
}

// Render coding question
function renderCoding(question, savedAnswer) {
    const code = savedAnswer || question.default_code || '';
    return `
        <div class="coding-container">
            <div class="code-editor-wrapper">
                <div class="code-editor-header">
                    <span class="code-language">${question.language?.toUpperCase() || 'C'}</span>
                    <div class="code-actions">
                        <button class="btn btn-secondary btn-sm" onclick="runCode(${question.id})">
                            ▶ Run Code
                        </button>
                    </div>
                </div>
                <textarea 
                    class="code-editor" 
                    id="code-${question.id}"
                    spellcheck="false"
                    oninput="updateAnswer(${question.id}, this.value)"
                >${code}</textarea>
            </div>
            <div class="output-container">
                <div class="output-header">
                    <span>Output</span>
                    <span id="output-status-${question.id}"></span>
                </div>
                <pre class="output-content" id="output-${question.id}">Run your code to see output...</pre>
            </div>
        </div>
    `;
}

// Select option (multiple choice)
function selectOption(element, questionId, value) {
    // Update UI
    const options = element.parentElement.querySelectorAll('.option-item');
    options.forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');

    // Update answer
    updateAnswer(questionId, value);
}

// Update answer
function updateAnswer(questionId, value) {
    answers[questionId] = value;
    updateQuestionNavState();
}

// Update question nav state
function updateQuestionNavState() {
    const buttons = elements.questionList.querySelectorAll('.question-btn');
    examData.questions.forEach((q, i) => {
        const answered = answers[q.id] !== undefined && answers[q.id] !== '';
        buttons[i]?.classList.toggle('answered', answered);
    });
}

// Run code
async function runCode(questionId) {
    const question = examData.questions.find(q => q.id === questionId);
    const code = document.getElementById(`code-${questionId}`).value;
    const outputEl = document.getElementById(`output-${questionId}`);
    const statusEl = document.getElementById(`output-status-${questionId}`);

    outputEl.textContent = 'Compiling...';
    outputEl.className = 'output-content';
    statusEl.textContent = '';

    try {
        const res = await fetch('/api/compile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code,
                language: question.language || 'c',
                input: question.test_cases?.[0]?.input || ''
            })
        });

        const result = await res.json();

        if (result.success) {
            outputEl.textContent = result.output || '(No output)';
            outputEl.className = 'output-content success';
            statusEl.textContent = `✓ ${result.execution_time_ms}ms`;
        } else {
            outputEl.textContent = result.error || 'Compilation failed';
            outputEl.className = 'output-content error';
            statusEl.textContent = '✗ Error';
        }
    } catch (err) {
        outputEl.textContent = 'Failed to compile: ' + err.message;
        outputEl.className = 'output-content error';
    }
}

// Navigation
function prevQuestion() {
    if (currentQuestion > 0) {
        goToQuestion(currentQuestion - 1);
    }
}

function nextQuestion() {
    if (currentQuestion < examData.questions.length - 1) {
        goToQuestion(currentQuestion + 1);
    }
}

function updateNavButtons() {
    elements.prevBtn.disabled = currentQuestion === 0;
    elements.nextBtn.disabled = currentQuestion === examData.questions.length - 1;
}

// Save current answer
function saveCurrentAnswer() {
    saveCurrentAnswerSilent();

    // Show feedback
    const btn = document.getElementById('saveBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '✓ Saved!';
    btn.classList.add('btn-success');

    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.classList.remove('btn-success');
    }, 1500);
}

async function saveCurrentAnswerSilent() {
    const question = examData.questions[currentQuestion];
    const answer = answers[question.id];

    if (answer === undefined) return;

    try {
        await fetch('/api/answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_id: studentId,
                question_id: question.id,
                answer
            })
        });
    } catch (err) {
        console.error('Failed to save answer:', err);
    }
}

// Auto-save
function startAutoSave() {
    autoSaveInterval = setInterval(async () => {
        // Save all answers
        const answerList = Object.entries(answers).map(([id, ans]) => ({
            question_id: parseInt(id),
            answer: ans
        }));

        if (answerList.length === 0) return;

        try {
            await fetch('/api/answers/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    student_id: studentId,
                    answers: answerList
                })
            });
            console.log('Auto-saved answers');
        } catch (err) {
            console.error('Auto-save failed:', err);
        }
    }, 30000); // Every 30 seconds
}

// Timer
function startTimer(endsAt) {
    if (timerInterval) clearInterval(timerInterval);

    console.log('Starting timer with endsAt:', endsAt);

    // Validate endsAt
    if (!endsAt) {
        console.error('No endsAt provided, timer not started');
        elements.examTimer.textContent = 'No limit';
        return;
    }

    const endTime = new Date(endsAt).getTime();
    console.log('End time (ms):', endTime, 'Now:', Date.now());

    // Check if endTime is valid
    if (isNaN(endTime)) {
        console.error('Invalid endsAt date:', endsAt);
        elements.examTimer.textContent = 'Invalid';
        return;
    }

    // Check if already expired
    const initialDiff = endTime - Date.now();
    if (initialDiff <= 0) {
        console.warn('Exam time already expired, not auto-submitting on startup');
        elements.examTimer.textContent = '00:00:00';
        elements.examTimer.classList.add('warning');
        return; // Don't auto-submit on initial load if time is already up
    }

    timerInterval = setInterval(() => {
        const now = Date.now();
        const diff = endTime - now;

        if (diff <= 0) {
            elements.examTimer.textContent = '00:00:00';
            elements.examTimer.classList.add('warning');
            clearInterval(timerInterval);
            // Auto-submit
            submitExam();
            return;
        }

        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);

        elements.examTimer.textContent =
            `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

        // Warning when less than 5 minutes
        if (diff < 300000) {
            elements.examTimer.classList.add('warning');
        }
    }, 1000);
}

// Heartbeat
function startHeartbeat() {
    setInterval(() => {
        if (socket && socket.connected) {
            socket.emit('heartbeat', {
                student_id: studentId,
                is_focused: document.hasFocus()
            });
        }
    }, 5000);

    // Focus detection
    window.addEventListener('blur', () => {
        if (socket && socket.connected) {
            socket.emit('focus:lost', { student_id: studentId });
        }
    });

    window.addEventListener('focus', () => {
        if (socket && socket.connected) {
            socket.emit('focus:regained', { student_id: studentId });
        }
    });
}

// Submit exam
async function submitExam() {
    closeModal();

    // Save all answers first
    const answerList = Object.entries(answers).map(([id, ans]) => ({
        question_id: parseInt(id),
        answer: ans
    }));

    try {
        await fetch('/api/answers/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_id: studentId,
                answers: answerList
            })
        });

        // Show completion screen
        showCompletionScreen();

    } catch (err) {
        console.error('Failed to submit:', err);
        alert('Failed to submit exam. Please try again.');
    }
}

// Show exam completion screen
function showCompletionScreen() {
    document.getElementById('app').innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: linear-gradient(135deg, #0f0f1a, #1a1a2e);
            color: white;
            font-family: system-ui, sans-serif;
            text-align: center;
            padding: 20px;
        ">
            <div style="font-size: 5rem; margin-bottom: 20px;">✅</div>
            <h1 style="font-size: 2.5rem; margin-bottom: 10px; color: #00d9a0;">Exam Submitted!</h1>
            <p style="font-size: 1.2rem; color: #a0a0b0; margin-bottom: 30px;">
                Your answers have been saved successfully.
            </p>
            <p style="font-size: 1rem; color: #666;">
                You may now close this window or wait for further instructions.
            </p>
            <div id="autoExitCountdown" style="
                margin-top: 40px;
                padding: 15px 30px;
                background: rgba(255,255,255,0.05);
                border-radius: 10px;
                font-size: 0.9rem;
                color: #888;
            ">
                Closing in <span id="countdown">5</span> seconds...
            </div>
        </div>
    `;

    // Auto-exit for kiosk mode
    if (window.lanlock && window.lanlock.forceQuit) {
        let seconds = 5;
        const countdownEl = document.getElementById('countdown');

        const interval = setInterval(() => {
            seconds--;
            if (countdownEl) countdownEl.textContent = seconds;

            if (seconds <= 0) {
                clearInterval(interval);
                window.lanlock.forceQuit();
            }
        }, 1000);
    } else {
        // Not in kiosk mode, hide countdown
        const countdownDiv = document.getElementById('autoExitCountdown');
        if (countdownDiv) {
            countdownDiv.innerHTML = 'You may close this window now.';
        }
    }
}

// Modal
function closeModal() {
    elements.submitModal.classList.add('hidden');
}

// Screen management
function showScreen(screen) {
    elements.loginScreen.classList.add('hidden');
    elements.waitingScreen.classList.add('hidden');
    elements.examScreen.classList.add('hidden');

    switch (screen) {
        case 'login':
            elements.loginScreen.classList.remove('hidden');
            break;
        case 'waiting':
            elements.waitingScreen.classList.remove('hidden');
            break;
        case 'exam':
            elements.examScreen.classList.remove('hidden');
            break;
    }
}

// UI helpers
function showError(message) {
    elements.loginError.textContent = message;
}

function updateConnectionStatus(connected, text) {
    if (connected) {
        elements.connectionIndicator.classList.remove('disconnected');
        elements.connectionIndicator.querySelector('.status-text').textContent = text || 'Connected';
    } else {
        elements.connectionIndicator.classList.add('disconnected');
        elements.connectionIndicator.querySelector('.status-text').textContent = text || 'Disconnected';
    }
}

function formatType(type) {
    switch (type) {
        case 'multiple_choice': return 'Multiple Choice';
        case 'short_answer': return 'Short Answer';
        case 'coding': return 'Coding';
        default: return type;
    }
}

function pad(num) {
    return String(num).padStart(2, '0');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Request exit from exam (close button)
function requestExitFromExam() {
    // Check if running in kiosk mode (has lanlock API)
    if (window.lanlock) {
        // Show the exit code dialog (SEB-style)
        if (window.lanlock.requestExit) {
            window.lanlock.requestExit();
        }
    } else {
        // Normal browser mode - just confirm and close
        if (confirm('Are you sure you want to close the exam?')) {
            window.close();
        }
    }
}
