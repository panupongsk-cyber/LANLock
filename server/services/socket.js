/**
 * LANLock Socket.io Service
 * Real-time communication between clients and server
 */

const config = require('../config');
const db = require('../database/init');

let io = null;
let heartbeatChecker = null;

/**
 * Initialize Socket.io handlers
 * @param {SocketIO.Server} socketIo - Socket.io server instance
 */
function init(socketIo) {
    io = socketIo;

    io.on('connection', (socket) => {
        console.log(`[Socket] New connection: ${socket.id}`);

        // Student connects with their ID
        socket.on('student:connect', (data) => {
            const { student_id, name, display_count, displays } = data;
            const ipAddress = socket.handshake.address;

            console.log(`[Socket] Student connected: ${student_id} (${name}) - ${display_count || 1} display(s)`);

            // Register student in database
            db.students.upsert(student_id, name || student_id, ipAddress);

            // Join student to their own room for targeted messages
            socket.join(`student:${student_id}`);
            socket.studentId = student_id;

            // Log multi-monitor as warning
            if (display_count && display_count > 1) {
                console.log(`[Warning] ${student_id} has ${display_count} monitors`);
            }

            // Broadcast updated student list to dashboard
            broadcastStudentList();
        });

        // Multi-monitor violation
        socket.on('violation:multi_monitor', (data) => {
            const { student_id, display_count, displays } = data;

            console.log(`[Violation] Multi-monitor detected: ${student_id} has ${display_count} displays`);

            // Log to database
            db.violations.log(
                student_id,
                'MULTI_MONITOR',
                `Student has ${display_count} monitors: ${JSON.stringify(displays)}`
            );

            // Notify dashboard
            io.to('dashboard').emit('violation:multi_monitor', {
                student_id,
                display_count,
                displays,
                timestamp: new Date().toISOString()
            });
        });

        // Heartbeat from client
        socket.on('heartbeat', (data) => {
            const { student_id, is_focused } = data;

            if (student_id) {
                db.students.updateHeartbeat(student_id, is_focused);

                // If focus changed, broadcast update
                broadcastStudentList();
            }
        });

        // Focus lost event (immediate notification)
        socket.on('focus:lost', (data) => {
            const { student_id } = data;

            if (student_id) {
                // Log violation
                db.violations.log(student_id, 'FOCUS_LOST', 'Window focus lost');
                db.students.updateHeartbeat(student_id, false);

                console.log(`[Violation] Focus lost: ${student_id}`);

                // Broadcast to dashboard immediately
                broadcastStudentList();
                broadcastViolation(student_id, 'FOCUS_LOST');
            }
        });

        // Focus regained
        socket.on('focus:regained', (data) => {
            const { student_id } = data;

            if (student_id) {
                db.students.updateHeartbeat(student_id, true);
                broadcastStudentList();
            }
        });

        // Dashboard connects
        socket.on('dashboard:connect', () => {
            console.log('[Socket] Dashboard connected');
            socket.join('dashboard');

            // Send current state
            socket.emit('students:update', getStudentListData());
            socket.emit('exam:state', db.examState.get());
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            console.log(`[Socket] Disconnected: ${socket.id}`);

            if (socket.studentId) {
                db.students.setOffline(socket.studentId);
                broadcastStudentList();
            }
        });

        // Exit request from student
        socket.on('exit:request', (data) => {
            const { student_id, student_name, reason } = data;
            console.log(`[Exit] Request from ${student_id}: ${reason}`);

            // Store the socket for this student
            socket.exitPending = true;

            // Notify dashboard
            io.to('dashboard').emit('exit:request', {
                student_id,
                student_name: student_name || student_id,
                reason: reason || 'No reason provided',
                socket_id: socket.id,
                timestamp: new Date().toISOString()
            });
        });

        // Instructor approves exit
        socket.on('exit:approve', (data) => {
            const { student_id } = data;
            console.log(`[Exit] Approved for ${student_id}`);

            // Send to student's room
            io.to(`student:${student_id}`).emit('exit:granted', { student_id });
        });

        // Instructor denies exit
        socket.on('exit:deny', (data) => {
            const { student_id } = data;
            console.log(`[Exit] Denied for ${student_id}`);

            // Send to student's room
            io.to(`student:${student_id}`).emit('exit:denied', { student_id });
        });
    });

    // Start heartbeat checker (runs every 5 seconds)
    startHeartbeatChecker();

    console.log('✓ Socket.io initialized');
}

/**
 * Start periodic heartbeat checker
 */
function startHeartbeatChecker() {
    if (heartbeatChecker) {
        clearInterval(heartbeatChecker);
    }

    heartbeatChecker = setInterval(() => {
        // Mark students as offline if no heartbeat within timeout
        const result = db.students.markStaleOffline(config.HEARTBEAT_TIMEOUT);

        if (result.changes > 0) {
            console.log(`[Heartbeat] Marked ${result.changes} student(s) as offline`);
            broadcastStudentList();
        }
    }, config.HEARTBEAT_INTERVAL);
}

/**
 * Get student list with status info
 */
function getStudentListData() {
    const students = db.students.getAll();
    const stats = db.students.getStats();
    const violationCount = db.violations.getCount();

    return {
        students: students.map(s => ({
            id: s.id,
            name: s.name,
            status: s.status,
            is_focused: s.is_focused === 1,
            last_heartbeat: s.last_heartbeat,
            connected_at: s.connected_at
        })),
        stats: {
            ...stats,
            violations: violationCount.count
        }
    };
}

/**
 * Broadcast student list to all dashboards
 */
function broadcastStudentList() {
    if (io) {
        io.to('dashboard').emit('students:update', getStudentListData());
    }
}

/**
 * Broadcast a violation alert
 */
function broadcastViolation(studentId, type) {
    if (io) {
        io.to('dashboard').emit('violation:alert', {
            student_id: studentId,
            type,
            timestamp: new Date().toISOString()
        });
    }
}

/**
 * Broadcast exam state change
 */
function broadcastExamState(state) {
    if (io) {
        io.emit('exam:state', state);
    }
}

/**
 * Get the Socket.io instance
 */
function getIo() {
    return io;
}

module.exports = {
    init,
    getIo,
    broadcastStudentList,
    broadcastExamState,
    getStudentListData
};
