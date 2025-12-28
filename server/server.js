/**
 * LANLock Server - Main Entry Point
 * LAN-based exam proctoring platform
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const config = require('./config');
const db = require('./database/init');
const socketService = require('./services/socket');
const apiRoutes = require('./routes/api');
const compileRoutes = require('./routes/compile');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.io with CORS for local development
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Serve static files
app.use('/exam', express.static(path.join(__dirname, 'public', 'exam')));
app.use('/dashboard', express.static(path.join(__dirname, 'public', 'dashboard')));

// API routes
app.use('/api', apiRoutes);
app.use('/api/compile', compileRoutes);

// Root redirect
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>LANLock Server</title>
            <style>
                body {
                    font-family: system-ui, -apple-system, sans-serif;
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    color: #fff;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0;
                }
                .container {
                    text-align: center;
                    padding: 40px;
                    background: rgba(255,255,255,0.1);
                    border-radius: 20px;
                    backdrop-filter: blur(10px);
                }
                h1 { margin: 0 0 10px; font-size: 2.5em; }
                p { color: #a0a0a0; margin: 20px 0; }
                .links { display: flex; gap: 20px; justify-content: center; margin-top: 30px; }
                a {
                    padding: 15px 30px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    text-decoration: none;
                    border-radius: 10px;
                    font-weight: bold;
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                a:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
                }
                .status { 
                    margin-top: 20px; 
                    padding: 10px 20px; 
                    background: rgba(0,255,100,0.2); 
                    border-radius: 10px;
                    display: inline-block;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🔒 LANLock Server</h1>
                <p>LAN-based Exam Proctoring Platform</p>
                <div class="status">✓ Server Running on Port ${config.PORT}</div>
                <div class="links">
                    <a href="/dashboard/">📊 Instructor Dashboard</a>
                    <a href="/exam/">📝 Student Exam</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('[Error]', err);
    res.status(500).json({ error: err.message });
});

// Initialize application
async function main() {
    // Initialize database (async for sql.js)
    await db.init();

    // Initialize Socket.io service
    socketService.init(io);

    // Start server
    server.listen(config.PORT, config.HOST, () => {
        console.log('');
        console.log('╔════════════════════════════════════════════╗');
        console.log('║         🔒 LANLock Server Started          ║');
        console.log('╠════════════════════════════════════════════╣');
        console.log(`║  Server:     http://${config.HOST}:${config.PORT}          ║`);
        console.log(`║  Dashboard:  http://localhost:${config.PORT}/dashboard/  ║`);
        console.log(`║  Exam:       http://localhost:${config.PORT}/exam/       ║`);
        console.log('╚════════════════════════════════════════════╝');
        console.log('');
    });
}

main().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    db.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down server...');
    db.close();
    process.exit(0);
});
