const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const electronBinary = require("electron");

function main() {
    const childEnv = { ...process.env };
    delete childEnv.ELECTRON_RUN_AS_NODE;

    execFileSync("npx", ["tsc", "-p", "electron/tsconfig.json"], {
        cwd: projectRoot,
        stdio: "inherit",
        shell: true
    });

    const result = spawnSync(electronBinary, [path.join(__dirname, "smoke_runner.js")], {
        cwd: projectRoot,
        stdio: "inherit",
        env: childEnv
    });

    process.exit(result.status ?? 1);
}

main();
