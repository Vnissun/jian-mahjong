const fs=require('node:fs'),path=require('node:path');fs.cpSync(path.resolve(__dirname,'../web-assets/sounds'),path.resolve(__dirname,'../build/web-repaired/sounds'),{recursive:true});console.log('Game audio copied');
// Also support existing BaoTa installs serving the web root with Nginx and proxying only /api/.
fs.cpSync(path.resolve(__dirname,'../server/test-admin'),path.resolve(__dirname,'../build/web-repaired/test-admin'),{recursive:true});console.log('Test admin web page copied');

fs.cpSync(path.resolve(__dirname,'../web-assets/social'),path.resolve(__dirname,'../build/web-repaired/social'),{recursive:true});console.log('Social artwork credits copied');
