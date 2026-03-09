const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const releaseDir = path.join(projectRoot, "release");
const artifactsDir = path.join(projectRoot, "artifacts");
const INSTALLER_EXTENSIONS = new Set([".exe", ".dmg"]);
const PRUNE_PATTERNS = [
    /-unpacked$/i,
    /^builder-debug\.yml$/i,
    /^builder-effective-config\.yaml$/i
];

function ensureCleanDirectory(dirPath) {
    fs.rmSync(dirPath, { recursive: true, force: true });
    fs.mkdirSync(dirPath, { recursive: true });
}

function shouldPrune(entryName) {
    return PRUNE_PATTERNS.some((pattern) => pattern.test(entryName));
}

function main() {
    if (!fs.existsSync(releaseDir)) {
        console.log("[collect-release-artifacts] No release directory found. Skipping.");
        return;
    }

    ensureCleanDirectory(artifactsDir);

    const copiedFiles = [];
    for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
        if (entry.isFile() && INSTALLER_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            const sourcePath = path.join(releaseDir, entry.name);
            const targetPath = path.join(artifactsDir, entry.name);
            fs.copyFileSync(sourcePath, targetPath);
            copiedFiles.push(entry.name);
            continue;
        }

        if (shouldPrune(entry.name)) {
            fs.rmSync(path.join(releaseDir, entry.name), { recursive: true, force: true });
        }
    }

    if (copiedFiles.length === 0) {
        console.log("[collect-release-artifacts] No .exe or .dmg installers found in release/.");
        return;
    }

    console.log(`[collect-release-artifacts] Copied installers to artifacts/: ${copiedFiles.join(", ")}`);
}

main();
