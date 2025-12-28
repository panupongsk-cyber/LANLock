/**
 * LANLock Compiler Service
 * Compiles and executes C/C++ code with timeout protection
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

// Ensure temp directory exists
if (!fs.existsSync(config.TEMP_DIR)) {
    fs.mkdirSync(config.TEMP_DIR, { recursive: true });
}

/**
 * Compile and execute C/C++ code
 * @param {string} code - Source code to compile
 * @param {string} language - 'c' or 'cpp'
 * @param {string} input - Stdin input for the program
 * @returns {Promise<{success: boolean, output: string, error: string, compileTime: number, execTime: number}>}
 */
async function compile(code, language = 'c', input = '') {
    const id = uuidv4();
    const ext = language === 'cpp' ? '.cpp' : '.c';
    const sourceFile = path.join(config.TEMP_DIR, `${id}${ext}`);
    const outputFile = path.join(config.TEMP_DIR, `${id}${process.platform === 'win32' ? '.exe' : ''}`);

    const compilerPath = language === 'cpp' ? config.GPP_PATH : config.GCC_PATH;

    try {
        // Write source code to temp file
        fs.writeFileSync(sourceFile, code, 'utf-8');

        // Compile the code
        const compileStart = Date.now();
        const compileResult = await runProcess(
            compilerPath,
            [sourceFile, '-o', outputFile, '-Wall'],
            '',
            config.COMPILE_TIMEOUT
        );
        const compileTime = Date.now() - compileStart;

        if (compileResult.code !== 0) {
            return {
                success: false,
                output: '',
                error: compileResult.stderr || 'Compilation failed',
                compileTime,
                execTime: 0
            };
        }

        // Execute the compiled program
        const execStart = Date.now();
        const execResult = await runProcess(
            outputFile,
            [],
            input,
            config.EXECUTION_TIMEOUT
        );
        const execTime = Date.now() - execStart;

        if (execResult.timeout) {
            return {
                success: false,
                output: execResult.stdout,
                error: 'Execution timed out (possible infinite loop)',
                compileTime,
                execTime
            };
        }

        return {
            success: execResult.code === 0,
            output: execResult.stdout,
            error: execResult.stderr,
            compileTime,
            execTime
        };

    } catch (err) {
        return {
            success: false,
            output: '',
            error: err.message,
            compileTime: 0,
            execTime: 0
        };
    } finally {
        // Cleanup temp files
        cleanup(sourceFile, outputFile);
    }
}

/**
 * Run a process with timeout
 */
function runProcess(command, args, stdin, timeout) {
    return new Promise((resolve) => {
        const proc = spawn(command, args, {
            timeout,
            killSignal: 'SIGKILL'
        });

        let stdout = '';
        let stderr = '';
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            proc.kill('SIGKILL');
        }, timeout);

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        if (stdin) {
            proc.stdin.write(stdin);
            proc.stdin.end();
        } else {
            proc.stdin.end();
        }

        proc.on('close', (code) => {
            clearTimeout(timer);
            resolve({
                code: timedOut ? -1 : code,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                timeout: timedOut
            });
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            resolve({
                code: -1,
                stdout: '',
                stderr: err.message,
                timeout: false
            });
        });
    });
}

/**
 * Clean up temporary files
 */
function cleanup(...files) {
    for (const file of files) {
        try {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

module.exports = { compile };
