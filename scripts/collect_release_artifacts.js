const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const launchConfig = require("../config/launch-config.json");
const packageJson = require("../package.json");

const projectRoot = path.resolve(__dirname, "..");
const releaseDir = path.resolve(projectRoot, process.env.RELEASE_INPUT_DIR || "release");
const artifactsDir = path.join(projectRoot, "artifacts");

const COPYABLE_EXTENSIONS = new Set([".exe", ".dmg", ".zip", ".yml", ".blockmap"]);
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

function sha256(filePath) {
    const hash = crypto.createHash("sha256");
    hash.update(fs.readFileSync(filePath));
    return hash.digest("hex");
}

function getReleaseTag() {
    return `${launchConfig.release.tagPrefix}${packageJson.version}`;
}

function getReleaseBaseUrl() {
    return `https://github.com/${launchConfig.release.owner}/${launchConfig.release.repo}/releases/download/${getReleaseTag()}`;
}

function getRepoUrl() {
    return `https://github.com/${launchConfig.release.owner}/${launchConfig.release.repo}`;
}

function getLatestDownloadUrl(fileName) {
    return `https://github.com/${launchConfig.release.owner}/${launchConfig.release.repo}/releases/latest/download/${encodeURIComponent(fileName)}`;
}

function getRawScriptUrl(scriptName) {
    return `${launchConfig.support.rawContentBaseUrl}/${scriptName}`;
}

function createAssetDescriptor(fileName, checksum) {
    const lower = fileName.toLowerCase();
    const base = {
        fileName,
        checksumSha256: checksum,
        url: `${getReleaseBaseUrl()}/${encodeURIComponent(fileName)}`,
        latestUrl: getLatestDownloadUrl(fileName)
    };

    if (lower.endsWith(".exe")) {
        return {
            ...base,
            platform: "windows",
            arch: "x64",
            kind: "nsis"
        };
    }

    if (lower.endsWith(".dmg")) {
        return {
            ...base,
            platform: "macos",
            arch: lower.includes("universal") ? "universal" : "arm64",
            kind: "dmg"
        };
    }

    if (lower.endsWith(".zip")) {
        return {
            ...base,
            platform: "macos",
            arch: lower.includes("universal") ? "universal" : "arm64",
            kind: "zip"
        };
    }

    if (lower.endsWith(".yml")) {
        return {
            ...base,
            platform: "meta",
            arch: "any",
            kind: "updater"
        };
    }

    if (lower.endsWith(".blockmap")) {
        return {
            ...base,
            platform: "meta",
            arch: "any",
            kind: "blockmap"
        };
    }

    return {
        ...base,
        platform: "meta",
        arch: "any",
        kind: "file"
    };
}

function writeChecksums(copiedFiles) {
    const lines = copiedFiles.map(({ name, checksum }) => `${checksum}  ${name}`);
    const targetPath = path.join(artifactsDir, launchConfig.release.checksumsFileName);
    fs.writeFileSync(targetPath, `${lines.join("\n")}\n`, "utf8");
    return targetPath;
}

function writeReleaseNotes(assets) {
    const notes = [
        `# Ghost Writer ${packageJson.version}`,
        "",
        "## Positioning",
        "Ghost Writer v1.0.0 ships as a desktop beta for individual users.",
        "",
        "## Supported platforms",
        ...launchConfig.release.supportedPlatforms.map((platform) => `- ${platform.label}`),
        "",
        "## Primary install commands",
        `- Windows: \`powershell -NoProfile -ExecutionPolicy Bypass -Command "irm ${getRawScriptUrl(launchConfig.release.installScriptWindows)} | iex"\``,
        `- macOS: \`curl -fsSL ${getRawScriptUrl(launchConfig.release.installScriptMac)} | bash\``,
        "",
        "## Included artifacts",
        ...assets.map((asset) => `- ${asset.fileName} (${asset.platform}/${asset.arch}, ${asset.kind})`),
        "",
        `Support: ${launchConfig.support.issuesUrl}`
    ];

    const targetPath = path.join(artifactsDir, launchConfig.release.notesFileName);
    fs.writeFileSync(targetPath, `${notes.join("\n")}\n`, "utf8");
    return targetPath;
}

function writeReleaseManifest(assets) {
    const manifest = {
        appName: launchConfig.appName,
        productName: launchConfig.productName,
        version: packageJson.version,
        tag: getReleaseTag(),
        launchMode: launchConfig.launchMode,
        monetizationEnabled: launchConfig.monetizationEnabled,
        telemetryDefaultEnabled: launchConfig.telemetryDefaultEnabled,
        repo: {
            owner: launchConfig.release.owner,
            name: launchConfig.release.repo,
            url: getRepoUrl()
        },
        supportedPlatforms: launchConfig.release.supportedPlatforms,
        assets,
        install: {
            windows: {
                scriptUrl: getRawScriptUrl(launchConfig.release.installScriptWindows),
                command: `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm ${getRawScriptUrl(launchConfig.release.installScriptWindows)} | iex"`
            },
            macos: {
                scriptUrl: getRawScriptUrl(launchConfig.release.installScriptMac),
                command: `curl -fsSL ${getRawScriptUrl(launchConfig.release.installScriptMac)} | bash`
            }
        },
        support: {
            issuesUrl: launchConfig.support.issuesUrl,
            privacyDoc: `${getRepoUrl()}/blob/main/${launchConfig.support.privacyDocPath}`,
            troubleshootingDoc: `${getRepoUrl()}/blob/main/${launchConfig.support.troubleshootingDocPath}`
        },
        generatedAt: new Date().toISOString()
    };

    const targetPath = path.join(artifactsDir, launchConfig.release.manifestFileName);
    fs.writeFileSync(targetPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return targetPath;
}

function main() {
    if (!fs.existsSync(releaseDir)) {
        console.log("[collect-release-artifacts] No release directory found. Skipping.");
        return;
    }

    ensureCleanDirectory(artifactsDir);

    const copiedFiles = [];
    for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
        if (entry.isFile() && COPYABLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            const sourcePath = path.join(releaseDir, entry.name);
            const targetPath = path.join(artifactsDir, entry.name);
            fs.copyFileSync(sourcePath, targetPath);
            copiedFiles.push({
                name: entry.name,
                checksum: sha256(targetPath)
            });
            continue;
        }

        if (shouldPrune(entry.name)) {
            fs.rmSync(path.join(releaseDir, entry.name), { recursive: true, force: true });
        }
    }

    if (copiedFiles.length === 0) {
        console.log("[collect-release-artifacts] No release artifacts found in release/.");
        return;
    }

    const assetDescriptors = copiedFiles.map(({ name, checksum }) => createAssetDescriptor(name, checksum));
    const checksumPath = writeChecksums(copiedFiles);
    const manifestPath = writeReleaseManifest(assetDescriptors);
    const notesPath = writeReleaseNotes(assetDescriptors);

    console.log(`[collect-release-artifacts] Copied release artifacts to artifacts/: ${copiedFiles.map((file) => file.name).join(", ")}`);
    console.log(`[collect-release-artifacts] Wrote ${path.basename(checksumPath)}, ${path.basename(manifestPath)}, and ${path.basename(notesPath)}.`);
}

main();
