const fs = require('node:fs');
const path = require('node:path');
const ts = require('./typescript.cjs')();
require.extensions['.ts'] = (module, filename) => {
    const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true }, fileName: filename,
    });
    module._compile(result.outputText, filename);
};
const dir = path.resolve(__dirname, '../tests');
for (const filename of fs.readdirSync(dir).filter(f => f.endsWith('.test.ts')).sort()) {
    require(path.join(dir, filename));
}
const summary = require(path.join(dir, 'runner.ts')).runAllTests();
if (!summary.includes('失败：0')) process.exitCode = 1;
