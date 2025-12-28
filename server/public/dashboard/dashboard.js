/**
 * LANLock Dashboard - JavaScript
 * Real-time student monitoring interface
 */

// State
let socket = null;
let examState = null;
let timerInterval = null;

// DOM Elements
const elements = {
    sessionName: document.getElementById('sessionName'),
    timer: document.getElementById('timer'),
    openLobbyBtn: document.getElementById('openLobbyBtn'),
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    resetBtn: document.getElementById('resetBtn'),
    shutdownBtn: document.getElementById('shutdownBtn'),
    studentGrid: document.getElementById('studentGrid'),
    totalStudents: document.getElementById('totalStudents'),
    onlineStudents: document.getElementById('onlineStudents'),
    focusedStudents: document.getElementById('focusedStudents'),
    violationCount: document.getElementById('violationCount'),
    connectionStatus: document.getElementById('connectionStatus'),
    toastContainer: document.getElementById('toastContainer'),
    serverIpDisplay: document.getElementById('serverIpDisplay')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    loadExamInfo();
    fetchServerInfo();
});

// Socket.io connection
function initSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('Connected to server');
        updateConnectionStatus('connected');
        socket.emit('dashboard:connect');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        updateConnectionStatus('disconnected');
    });

    socket.on('students:update', (data) => {
        updateStudentGrid(data.students);
        updateStats(data.stats);
    });

    socket.on('exam:state', (state) => {
        examState = state;
        updateExamControls(state);
    });

    socket.on('violation:alert', (data) => {
        showViolationToast(data);
    });

    // Exit request from student
    socket.on('exit:request', (data) => {
        showExitRequestToast(data);
    });

    // Multi-monitor detection
    socket.on('violation:multi_monitor', (data) => {
        showMultiMonitorToast(data);
    });
}

// Load exam info (no longer needed, session is input by instructor)
async function loadExamInfo() {
    // Session name is now entered by instructor
}

// Fetch server info
async function fetchServerInfo() {
    try {
        const res = await fetch('/api/server-info');
        const data = await res.json();
        if (data.ip) {
            elements.serverIpDisplay.textContent = `${data.ip}:${data.port}`;
        }
    } catch (err) {
        console.error('Failed to fetch server info:', err);
        elements.serverIpDisplay.textContent = 'Unknown';
    }
}

// Update student grid
function updateStudentGrid(students) {
    if (!students || students.length === 0) {
        elements.studentGrid.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📡</span>
                <p>Waiting for students to connect...</p>
                <p class="hint">Students should open the exam client and log in</p>
            </div>
        `;
        return;
    }

    elements.studentGrid.innerHTML = students.map(student => {
        const status = getStudentStatus(student);
        const initials = getInitials(student.name || student.id);
        const statusText = getStatusText(status);
        const lastSeen = formatTime(student.last_heartbeat);

        return `
            <div class="student-card ${status}">
                <div class="student-header">
                    <div class="student-avatar">${initials}</div>
                    <div class="student-info">
                        <div class="student-name">${escapeHtml(student.name || student.id)}</div>
                        <div class="student-id">${escapeHtml(student.id)}</div>
                    </div>
                    <div class="status-indicator"></div>
                </div>
                <div class="student-status">${statusText}</div>
                <div class="student-time">Last seen: ${lastSeen}</div>
            </div>
        `;
    }).join('');
}

// Get student status class
function getStudentStatus(student) {
    if (student.status === 'offline') return 'offline';
    if (!student.is_focused) return 'unfocused';
    return 'online';
}

// Get status text
function getStatusText(status) {
    switch (status) {
        case 'online': return '🟢 Focused';
        case 'unfocused': return '🟡 Focus Lost';
        case 'offline': return '🔴 Offline';
        default: return 'Unknown';
    }
}

// Update statistics
function updateStats(stats) {
    elements.totalStudents.textContent = stats.total || 0;
    elements.onlineStudents.textContent = stats.online || 0;
    elements.focusedStudents.textContent = stats.focused || 0;
    elements.violationCount.textContent = stats.violations || 0;
}

// Update exam controls based on state
// States: 'setup' | 'lobby' | 'active' | 'ended'
function updateExamControls(state) {
    const examState = state.state || 'setup';

    // Get element references
    const durationInput = document.getElementById('examDuration');
    const examFile = document.getElementById('examFile');
    const sessionName = elements.sessionName;

    switch (examState) {
        case 'setup':
            elements.openLobbyBtn.disabled = false;
            elements.openLobbyBtn.style.display = '';
            elements.startBtn.disabled = true;
            elements.startBtn.style.display = '';
            elements.stopBtn.disabled = true;
            elements.stopBtn.style.display = '';
            elements.resetBtn.style.display = 'none';

            // Enable settings
            if (durationInput) durationInput.disabled = false;
            if (examFile) examFile.disabled = false;
            if (sessionName) sessionName.disabled = false;
            stopTimer();
            break;

        case 'lobby':
            elements.openLobbyBtn.disabled = true;
            elements.openLobbyBtn.style.display = '';
            elements.startBtn.disabled = false;
            elements.startBtn.style.display = '';
            elements.stopBtn.disabled = true;
            elements.stopBtn.style.display = '';
            elements.resetBtn.style.display = '';

            // Disable settings but not timer
            if (durationInput) durationInput.disabled = false; // Can still change duration
            if (examFile) examFile.disabled = true;
            if (sessionName) sessionName.disabled = true;
            break;

        case 'active':
            elements.openLobbyBtn.style.display = 'none';
            elements.startBtn.disabled = true;
            elements.startBtn.style.display = 'none';
            elements.stopBtn.disabled = false;
            elements.stopBtn.style.display = '';
            elements.resetBtn.style.display = 'none';

            // Disable all settings
            if (durationInput) durationInput.disabled = true;
            if (examFile) examFile.disabled = true;
            if (sessionName) sessionName.disabled = true;

            if (state.ends_at) {
                startTimer(state.ends_at);
            }
            break;

        case 'ended':
            elements.openLobbyBtn.style.display = 'none';
            elements.startBtn.style.display = 'none';
            elements.stopBtn.disabled = true;
            elements.stopBtn.style.display = 'none';
            elements.resetBtn.style.display = '';

            stopTimer();
            elements.timer.textContent = 'Ended';
            break;
    }
}

// Open lobby - allow students to connect
async function openLobby() {
    const sessionName = elements.sessionName.value.trim() || 'Exam Session';
    const exitCode = document.getElementById('exitCode').value.trim() || '1234';
    const rules = `Welcome to ${sessionName}!\n\nPlease wait for the instructor to start the exam.\n\nRules:\n• Do not close this window\n• Stay focused on the exam\n• No external help allowed`;

    try {
        const res = await fetch('/api/exam/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'open_lobby',
                exam_title: sessionName,
                exam_rules: rules,
                exit_code: exitCode
            })
        });

        console.log('Open lobby response status:', res.status);

        if (!res.ok) {
            const errorText = await res.text();
            console.error('Server error:', errorText);
            alert('Failed to open lobby: ' + errorText);
            return;
        }

        const data = await res.json();
        console.log('Open lobby response:', data);

        if (data.success) {
            examState = data.state;
            updateExamControls(data.state);
            showToast('📢', 'Lobby Opened', 'Students can now connect and see instructions');
        } else {
            alert('Failed to open lobby: ' + (data.error || 'Unknown error'));
        }
    } catch (err) {
        console.error('Failed to open lobby:', err);
        alert('Failed to open lobby: ' + err.message);
    }
}

// Start exam (from lobby state)
async function startExam() {
    const durationInput = document.getElementById('examDuration');
    const duration = parseInt(durationInput.value) || 60;

    if (duration < 1 || duration > 300) {
        alert('Duration must be between 1 and 300 minutes');
        return;
    }

    try {
        const res = await fetch('/api/exam/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'start',
                duration_minutes: duration
            })
        });
        const data = await res.json();
        if (data.success) {
            examState = data.state;
            updateExamControls(data.state);
        } else {
            alert(data.error || 'Failed to start exam');
        }
    } catch (err) {
        console.error('Failed to start exam:', err);
        alert('Failed to start exam');
    }
}

// Stop exam
async function stopExam() {
    if (!confirm('Are you sure you want to stop the exam?')) return;

    try {
        const res = await fetch('/api/exam/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'stop' })
        });
        const data = await res.json();
        if (data.success) {
            examState = data.state;
            updateExamControls(data.state);
        }
    } catch (err) {
        console.error('Failed to stop exam:', err);
        alert('Failed to stop exam');
    }
}

// Reset exam to setup state
async function resetExam() {
    if (!confirm('Reset exam to setup state? This will clear the current session.')) return;

    try {
        const res = await fetch('/api/exam/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reset' })
        });
        const data = await res.json();
        if (data.success) {
            examState = data.state;
            updateExamControls(data.state);
            elements.timer.textContent = '--:--:--';
        }
    } catch (err) {
        console.error('Failed to reset exam:', err);
        alert('Failed to reset exam');
    }
}

// Timer functions
function startTimer(endsAt) {
    stopTimer();

    const endTime = new Date(endsAt).getTime();

    timerInterval = setInterval(() => {
        const now = Date.now();
        const diff = endTime - now;

        if (diff <= 0) {
            elements.timer.textContent = '00:00:00';
            elements.timer.classList.add('warning');
            stopTimer();
            return;
        }

        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);

        elements.timer.textContent =
            `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

        // Warning when less than 5 minutes
        if (diff < 300000) {
            elements.timer.classList.add('warning');
        } else {
            elements.timer.classList.remove('warning');
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    elements.timer.textContent = '--:--:--';
    elements.timer.classList.remove('warning');
}

// Show violation toast
function showViolationToast(data) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <span class="toast-icon">⚠️</span>
        <div class="toast-content">
            <div class="toast-title">Focus Lost</div>
            <div class="toast-message">Student ${escapeHtml(data.student_id)} switched windows</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    elements.toastContainer.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 5000);
}

// Update connection status
function updateConnectionStatus(status) {
    elements.connectionStatus.className = `connection-status ${status}`;
    elements.connectionStatus.innerHTML = `
        <span class="status-dot"></span> 
        ${status === 'connected' ? 'Connected' : 'Disconnected'}
    `;
}

// Utility functions
function pad(num) {
    return String(num).padStart(2, '0');
}

function getInitials(name) {
    return name
        .split(/[\s_-]/)
        .map(part => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

function formatTime(dateStr) {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleTimeString();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show toast notification
function showToast(icon, title, message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    elements.toastContainer.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() => toast.remove(), 5000);
}

// Show exit request toast with approve/deny buttons
function showExitRequestToast(data) {
    const toast = document.createElement('div');
    toast.className = 'toast exit-request';
    toast.style.background = 'linear-gradient(135deg, #1a1a2e, #2a2a4e)';
    toast.style.border = '1px solid #667eea';
    toast.innerHTML = `
        <span class="toast-icon">📤</span>
        <div class="toast-content" style="flex:1">
            <div class="toast-title">Exit Request</div>
            <div class="toast-message"><b>${escapeHtml(data.student_name)}</b> (${escapeHtml(data.student_id)})</div>
            <div class="toast-message" style="font-size:0.8rem;opacity:0.8">${escapeHtml(data.reason)}</div>
        </div>
        <div style="display:flex;gap:8px;margin-left:10px">
            <button onclick="approveExit('${escapeHtml(data.student_id)}', this)" style="
                padding:8px 16px;border:none;border-radius:6px;
                background:linear-gradient(135deg,#00b894,#00d9a0);
                color:white;cursor:pointer;font-weight:600;
            ">✓ Approve</button>
            <button onclick="denyExit('${escapeHtml(data.student_id)}', this)" style="
                padding:8px 16px;border:none;border-radius:6px;
                background:linear-gradient(135deg,#ee5a52,#ff6b6b);
                color:white;cursor:pointer;font-weight:600;
            ">✗ Deny</button>
        </div>
    `;

    elements.toastContainer.appendChild(toast);

    // Play sound (optional)
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU');
    } catch (e) { }
}

// Approve exit request
function approveExit(studentId, btn) {
    socket.emit('exit:approve', { student_id: studentId });
    const toast = btn.closest('.toast');
    toast.innerHTML = `
        <span class="toast-icon">✅</span>
        <div class="toast-content">
            <div class="toast-title" style="color:#00d9a0">Exit Approved</div>
            <div class="toast-message">Student ${escapeHtml(studentId)} can now exit</div>
        </div>
    `;
    setTimeout(() => toast.remove(), 3000);
}

// Deny exit request
function denyExit(studentId, btn) {
    socket.emit('exit:deny', { student_id: studentId });
    const toast = btn.closest('.toast');
    toast.innerHTML = `
        <span class="toast-icon">❌</span>
        <div class="toast-content">
            <div class="toast-title" style="color:#ff6b6b">Exit Denied</div>
            <div class="toast-message">Student ${escapeHtml(studentId)} must continue</div>
        </div>
    `;
    setTimeout(() => toast.remove(), 3000);
}

// Show multi-monitor warning toast
function showMultiMonitorToast(data) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.background = 'linear-gradient(135deg, #2a1a1a, #3a2a2a)';
    toast.style.border = '1px solid #ff9800';

    const displays = data.displays || [];
    const displayList = displays.map(d => `${d.width}x${d.height}`).join(', ');

    toast.innerHTML = `
        <span class="toast-icon">🖥️</span>
        <div class="toast-content">
            <div class="toast-title" style="color:#ff9800">⚠️ Multiple Monitors Detected</div>
            <div class="toast-message"><b>${escapeHtml(data.student_id)}</b> has ${data.display_count} displays</div>
            <div class="toast-message" style="font-size:0.8rem;opacity:0.7">${displayList}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    elements.toastContainer.appendChild(toast);

    // Don't auto-remove, let instructor dismiss manually
}

// Shutdown server
async function shutdownServer() {
    if (!confirm('⚠️ Are you sure you want to shutdown the server?\n\nThis will disconnect all students and stop the exam.')) {
        return;
    }

    try {
        elements.shutdownBtn.disabled = true;
        elements.shutdownBtn.innerHTML = '<span>⏻</span> Shutting down...';

        const res = await fetch('/api/shutdown', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            document.body.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;color:white;font-family:system-ui">
                    <div style="font-size:4rem;margin-bottom:20px">⏻</div>
                    <h1>Server Stopped</h1>
                    <p style="color:#a0a0b0;margin-top:10px">You can close this window</p>
                </div>
            `;
        } else {
            alert('Failed to shutdown server');
            elements.shutdownBtn.disabled = false;
            elements.shutdownBtn.innerHTML = '<span>⏻</span> Shutdown';
        }
    } catch (err) {
        console.error('Shutdown error:', err);
        alert('Error: ' + err.message);
        elements.shutdownBtn.disabled = false;
        elements.shutdownBtn.innerHTML = '<span>⏻</span> Shutdown';
    }
}
