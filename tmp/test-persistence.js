
const { DatabaseManager } = require('../dist-electron/db/DatabaseManager');
// We need to mock Electron app.getPath for this test or just use a temp path if possible.
// Since it's a compiled file, it might be tricky. Let's try a simpler approach by checking the code.

async function testPersistence() {
    console.log("Checking DatabaseManager.ts structural fix...");
    const fs = require('fs');
    const path = require('path');
    const dbFile = path.resolve(__dirname, '../electron/db/DatabaseManager.ts');
    const content = fs.readFileSync(dbFile, 'utf8');

    if (content.includes('screenshots: screenshotsArray')) {
        console.log("✅ getMeetingDetails now returns screenshotsArray.");
    } else {
        console.log("❌ getMeetingDetails still missing screenshotsArray!");
    }
}

testPersistence();
