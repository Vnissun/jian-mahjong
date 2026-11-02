const path = require('node:path');
module.exports = function compiler() {
    for (const candidate of [process.env.TYPESCRIPT_PATH, 'typescript',
        'C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript']) {
        if (!candidate) continue;
        try { return require(candidate); } catch {}
    }
    throw new Error('请安装 TypeScript（npm install），或设置 TYPESCRIPT_PATH 为 typescript 模块目录。');
};
