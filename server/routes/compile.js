/**
 * LANLock Compile Route
 * Endpoint for compiling and running C/C++ code
 */

const express = require('express');
const router = express.Router();
const compiler = require('../services/compiler');

// POST /api/compile - Compile and run code
router.post('/', async (req, res) => {
    const { code, language, input } = req.body;

    if (!code) {
        return res.status(400).json({
            success: false,
            error: 'Code is required'
        });
    }

    const lang = language || 'c';
    if (!['c', 'cpp'].includes(lang)) {
        return res.status(400).json({
            success: false,
            error: 'Language must be "c" or "cpp"'
        });
    }

    try {
        console.log(`[Compile] Compiling ${lang} code (${code.length} chars)`);

        const result = await compiler.compile(code, lang, input || '');

        console.log(`[Compile] Result: ${result.success ? 'Success' : 'Failed'} ` +
            `(compile: ${result.compileTime}ms, exec: ${result.execTime}ms)`);

        res.json({
            success: result.success,
            output: result.output,
            error: result.error,
            compile_time_ms: result.compileTime,
            execution_time_ms: result.execTime
        });

    } catch (err) {
        console.error('[Compile] Error:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// POST /api/compile/test - Run code against test cases
router.post('/test', async (req, res) => {
    const { code, language, test_cases } = req.body;

    if (!code || !Array.isArray(test_cases)) {
        return res.status(400).json({
            success: false,
            error: 'Code and test_cases are required'
        });
    }

    const lang = language || 'c';
    const results = [];

    for (let i = 0; i < test_cases.length; i++) {
        const testCase = test_cases[i];
        const result = await compiler.compile(code, lang, testCase.input || '');

        const passed = result.success &&
            result.output.trim() === (testCase.expected_output || '').trim();

        results.push({
            test_case: i + 1,
            input: testCase.input,
            expected: testCase.expected_output,
            actual: result.output,
            passed,
            error: result.error
        });
    }

    const allPassed = results.every(r => r.passed);

    res.json({
        success: allPassed,
        passed: results.filter(r => r.passed).length,
        total: results.length,
        results
    });
});

module.exports = router;
