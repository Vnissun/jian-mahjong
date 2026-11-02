const config = require('./production.json');
const { createServer } = require('./server.cjs');
const port = Number(process.env.PORT || config.port || 7458);
const host = process.env.HOST || config.host || '127.0.0.1';
createServer({ accessPassword: process.env.ACCESS_PASSWORD || config.accessPassword || 'CHANGE_ME_ACCESS_PASSWORD', publicUrl: process.env.PUBLIC_URL || config.publicUrl, testAdminPassword: config.testAdminEnabled===false ? false : process.env.TEST_ADMIN_PASSWORD || config.testAdminPassword }).listen(port, host, () => {
    console.log('集安麻将已启动：http://' + host + ':' + port);
});
