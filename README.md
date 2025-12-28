# LANLock - LAN-Based Exam Proctoring Platform

A lightweight, portable, LAN-based exam proctoring platform designed for computer laboratories with legacy hardware and restricted network environments.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                    USB DRIVE (Server)               │
│  ┌─────────────────────────────────────────────────┐
│  │ Node.js + Express.js + Socket.io + SQLite       │
│  │ MinGW-w64 (Portable GCC for C/C++ compilation)  │
│  └─────────────────────────────────────────────────┘
└──────────────────────┬──────────────────────────────┘
                       │ LAN (HTTP + WebSocket)
    ┌──────────────────┼──────────────────────────────┐
    ▼                  ▼                              ▼
┌────────┐      ┌────────┐                     ┌────────────┐
│Client 1│      │Client 2│  ...                │ Instructor │
│  .exe  │      │  .exe  │                     │  Browser   │
└────────┘      └────────┘                     └────────────┘
```

## 📁 Project Structure

```
LANLock/
├── server/                 # Node.js server
│   ├── server.js           # Main entry point
│   ├── config.js           # Configuration (port 2222)
│   ├── database/           # SQLite setup
│   ├── routes/             # API endpoints
│   ├── services/           # Business logic
│   ├── public/             # Static files
│   │   ├── dashboard/      # Instructor UI
│   │   └── exam/           # Student exam UI
│   └── data/               # Exam data JSON
│
├── client-electron/        # Cross-platform Electron client ⭐
│   ├── main.js             # Kiosk mode, keyboard blocking
│   ├── preload.js          # IPC bridge
│   ├── config.json         # Server IP/Port
│   └── renderer/           # Error pages
│
├── client/                 # C# WinForms client (Windows only)
│   └── LANLock/
│
└── README.md
```

## 🚀 Quick Start

### Prerequisites

**Server (Instructor PC):**
- Node.js 18+ (or portable Node.js)
- GCC/G++ compiler (MinGW-w64 for Windows)

**Client (Student PCs):**
- Windows 10/11
- Microsoft Edge WebView2 Runtime (usually pre-installed)

### 1. Start the Server

```bash
cd server
npm install
npm start
```

The server starts at `http://0.0.0.0:3000`

- **Dashboard**: http://localhost:3000/dashboard/
- **Exam (Web)**: http://localhost:3000/exam/

### 2. Configure Clients

Edit `client/LANLock/config.json`:

```json
{
    "server_ip": "192.168.1.100",  // Server IP address
    "server_port": 3000,
    "student_id": "",              // Can pre-fill or leave empty
    "student_name": ""
}
```

### 3. Build Client (on Windows)

```bash
cd client
dotnet restore
dotnet publish -c Release -r win-x64 --self-contained false
```

The portable `LANLock.exe` will be in `bin/Release/net6.0-windows/win-x64/publish/`

### 4. Deploy to Students

1. Copy `LANLock.exe` and `config.json` to shared network folder
2. Students run `LANLock.exe` from the network share
3. Client opens in kiosk mode and connects to server

---

## 📊 Dashboard Features

| Feature | Description |
|---------|-------------|
| 🟢 Green | Student is online and focused on exam |
| 🟡 Yellow | Student's window lost focus (Alt+Tab) |
| 🔴 Red | Student disconnected (no heartbeat > 10s) |
| ▶️ Start | Begin the exam countdown |
| ⏹️ Stop | End the exam immediately |

---

## 📝 Exam Configuration

Edit `server/data/exam_data.json`:

```json
{
  "exam_info": {
    "title": "Midterm Exam",
    "duration_minutes": 120
  },
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "text": "Question text?",
      "options": ["A", "B", "C", "D"],
      "answer": "A",
      "score": 1
    },
    {
      "id": 2,
      "type": "short_answer",
      "text": "Explain...",
      "score": 5
    },
    {
      "id": 3,
      "type": "coding",
      "language": "c",
      "text": "Write a program...",
      "default_code": "#include <stdio.h>\nint main() {}",
      "test_cases": [
        { "input": "5", "expected_output": "120" }
      ],
      "score": 10
    }
  ]
}
```

---

## 🔐 Security Features

### Client (Kiosk Mode)
- Fullscreen, borderless window
- Always on top (TopMost)
- Blocked: Alt+Tab, Alt+F4, Ctrl+Esc, Windows key
- Context menu disabled
- DevTools disabled
- Focus monitoring with violation reporting

### Server
- Heartbeat monitoring (5s interval)
- Offline detection (10s timeout)
- Violation logging (focus lost events)
- Code compilation sandboxing (2s timeout)

---

## 🛠️ API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/exam` | GET | Get exam questions (without answers) |
| `/api/exam/state` | GET | Get exam running state |
| `/api/exam/control` | POST | Start/stop exam |
| `/api/answer` | POST | Save student answer |
| `/api/answers/bulk` | POST | Save multiple answers |
| `/api/compile` | POST | Compile and run C/C++ code |
| `/api/students` | GET | Get connected students |
| `/api/results` | GET | Get all answers for grading |

---

## 📡 Socket.io Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `student:connect` | Client→Server | Student registration |
| `heartbeat` | Client→Server | Status ping (every 5s) |
| `focus:lost` | Client→Server | Window focus lost |
| `students:update` | Server→Dashboard | Student list update |
| `exam:state` | Server→All | Exam start/stop broadcast |

---

## ⚠️ Notes

1. **WebView2 Runtime**: The client requires Microsoft Edge WebView2 Runtime. It's included in Windows 11 and most Windows 10 installations.

2. **Compiler**: For coding questions, ensure GCC is in PATH or set `GCC_PATH` environment variable.

3. **Network**: All communication happens over LAN. No internet required.

4. **Portability**: Server can run from USB drive without installation.

---

## 📄 License

MIT License
