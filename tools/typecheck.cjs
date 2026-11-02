const ts = require('./typescript.cjs')();
const path = require('node:path');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const diagnostics = [];
for (const name of ['tsconfig.json', 'tsconfig.tests.json']) {
    const config = ts.readConfigFile(path.join(root, name), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    diagnostics.push(...parsed.errors, ...ts.getPreEmitDiagnostics(program));
}
if (diagnostics.length) {
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: f => f, getCurrentDirectory: () => root, getNewLine: () => '\n',
    }));
    process.exitCode = 1;
} else console.log('TypeScript 检查通过');
