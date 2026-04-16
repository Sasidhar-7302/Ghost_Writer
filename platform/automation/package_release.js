const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..", "..");
const electronBuilderBinary = path.join(
    projectRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "electron-builder.cmd" : "electron-builder"
);
const collectArtifactsScript = path.join(__dirname, "collect_release_artifacts.js");

function run(command, args) {
    const needsShell = process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
    const result = spawnSync(command, args, {
        cwd: projectRoot,
        stdio: "inherit",
        shell: needsShell
    });

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

run(electronBuilderBinary, process.argv.slice(2));
run(process.execPath, [collectArtifactsScript]);
