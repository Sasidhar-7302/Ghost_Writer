const { spawn, execFileSync } = require("child_process");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const electronBinary = require("electron");
const env = { ...process.env, NODE_ENV: "development" };
const distElectronDir = path.join(projectRoot, "dist-electron");
const compiledElectronDir = path.join(distElectronDir, "electron");
const requiredBuildFiles = [
  path.join(compiledElectronDir, "main.js"),
  path.join(compiledElectronDir, "shortcuts.js"),
];

delete env.ELECTRON_RUN_AS_NODE;

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureElectronBuildArtifacts() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const missing = requiredBuildFiles.filter((filePath) => {
      try {
        return !require("fs").existsSync(filePath);
      } catch {
        return true;
      }
    });

    if (missing.length === 0) {
      return;
    }

    await wait(150);
  }

  const missing = requiredBuildFiles.filter((filePath) => {
    try {
      return !require("fs").existsSync(filePath);
    } catch {
      return true;
    }
  });

  throw new Error(
    `Electron build is incomplete. Missing: ${missing.map((filePath) => path.basename(filePath)).join(", ")}`
  );
}

function cleanupInstalledGhostWriter() {
  if (process.platform !== "win32") {
    return;
  }

  try {
    const electronPath = path.join(projectRoot, "node_modules", "electron", "dist", "electron.exe")
      .replace(/'/g, "''");

    execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      "$ErrorActionPreference='SilentlyContinue'; " +
      `$electronPath = '${electronPath}'; ` +
      "Get-Process 'Ghost Writer' -ErrorAction SilentlyContinue | Stop-Process -Force; " +
      "Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $electronPath } | Stop-Process -Force; " +
      "Start-Sleep -Milliseconds 300"
    ], {
      cwd: projectRoot,
      stdio: "ignore",
      windowsHide: true,
    });
  } catch {
    // Best-effort dev cleanup only.
  }
}

cleanupInstalledGhostWriter();

(async () => {
  try {
    await ensureElectronBuildArtifacts();
  } catch (error) {
    console.error("[run_electron_dev] Failed to verify Electron build artifacts:", error.message || error);
    process.exit(1);
    return;
  }

  const child = spawn(electronBinary, [path.join(compiledElectronDir, "main.js")], {
    cwd: projectRoot,
    stdio: "inherit",
    env,
    windowsHide: false,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });

  child.on("error", (error) => {
    console.error("[run_electron_dev] Failed to start Electron:", error);
    process.exit(1);
  });
})();
