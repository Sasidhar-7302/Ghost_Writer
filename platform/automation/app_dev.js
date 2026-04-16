const { spawn, execFileSync } = require("child_process");
const http = require("http");
const net = require("net");
const path = require("path");
const fs = require("fs");

const projectRoot = path.resolve(__dirname, "..", "..");
const sessionFile = path.join(projectRoot, ".tmp", "app-dev-session.json");
const preferredPort = Number(process.env.GHOST_WRITER_DEV_PORT || 5180);

let viteProcess = null;
let electronProcess = null;
let shuttingDown = false;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortOccupied(port) {
  const probeHost = (host) =>
    new Promise((resolve) => {
      const socket = net.createConnection({ port, host });

      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });

      socket.once("error", (error) => {
        const code = error && typeof error === "object" ? error.code : "";
        if (code === "ECONNREFUSED" || code === "EHOSTUNREACH" || code === "ETIMEDOUT") {
          resolve(false);
          return;
        }

        resolve(true);
      });

      socket.setTimeout(500, () => {
        socket.destroy();
        resolve(false);
      });
    });

  return Promise.all([probeHost("127.0.0.1"), probeHost("::1")]).then((results) => results.some(Boolean));
}

function writeSessionFile() {
  fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
  fs.writeFileSync(sessionFile, JSON.stringify({
    managerPid: process.pid,
    vitePid: viteProcess?.pid || null,
    electronPid: electronProcess?.pid || null,
  }));
}

function removeSessionFile() {
  try {
    if (fs.existsSync(sessionFile)) {
      fs.unlinkSync(sessionFile);
    }
  } catch {
    // Ignore cleanup errors.
  }
}

function killProcessTree(pid) {
  if (!pid || Number.isNaN(Number(pid))) {
    return;
  }

  try {
    if (process.platform === "win32") {
      execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `taskkill /PID ${pid} /T /F`], {
        cwd: projectRoot,
        stdio: "ignore",
        windowsHide: true,
      });
      return;
    }

    process.kill(pid, "SIGTERM");
  } catch {
    // Ignore stale PIDs.
  }
}

function cleanupPreviousSessionFile() {
  if (!fs.existsSync(sessionFile)) {
    return;
  }

  try {
    const previousSession = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
    killProcessTree(previousSession.electronPid);
    killProcessTree(previousSession.vitePid);
    killProcessTree(previousSession.managerPid);
  } catch {
    // Ignore corrupt session state.
  } finally {
    removeSessionFile();
  }
}

function cleanupStaleWindowsDevProcesses() {
  if (process.platform !== "win32") {
    return;
  }

  const normalizedRoot = projectRoot.replace(/'/g, "''");
  const electronPath = path.join(projectRoot, "node_modules", "electron", "dist", "electron.exe")
    .replace(/'/g, "''");
  const installedAppPath = path.join(process.env.LOCALAPPDATA || "", "Programs", "Ghost Writer", "Ghost Writer.exe")
    .replace(/'/g, "''");

  try {
    execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      "$ErrorActionPreference='SilentlyContinue'; " +
      `$electronPath = '${electronPath}'; ` +
      `$installedAppPath = '${installedAppPath}'; ` +
      `$projectRoot = '${normalizedRoot}'; ` +
      "Get-Process 'Ghost Writer' -ErrorAction SilentlyContinue | Stop-Process -Force; " +
      "Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $electronPath } | Stop-Process -Force; " +
      "Get-CimInstance Win32_Process | " +
      "Where-Object { " +
      "  ($_.Name -eq 'node.exe' -or $_.Name -eq 'cmd.exe') -and " +
      "  $_.CommandLine -and " +
      "  $_.CommandLine -like ('*' + $projectRoot + '*') -and " +
      "  ( " +
      "    $_.CommandLine -like '*scripts\\app_dev.js*' -or " +
      "    $_.CommandLine -like '*scripts\\run_electron_dev.js*' -or " +
      "    $_.CommandLine -like '*vite.js*' -or " +
      "    $_.CommandLine -like '*dist-electron*electron*main.js*' -or " +
      "    $_.CommandLine -like '*npm run dev*' -or " +
      "    $_.CommandLine -like '*npm run electron:dev*' " +
      "  ) " +
      "} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; " +
      "Start-Sleep -Milliseconds 500"
    ], {
      cwd: projectRoot,
      stdio: "ignore",
      windowsHide: true,
    });
  } catch {
    // Best-effort dev cleanup only.
  }
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (!(await isPortOccupied(port))) {
      return port;
    }
  }

  throw new Error(`No available development port found between ${startPort} and ${startPort + 19}`);
}

function spawnProcess(command, args, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  for (const [key, value] of Object.entries(extraEnv)) {
    if (value === undefined || value === null) {
      delete env[key];
    }
  }

  if (process.platform === "win32") {
    const commandLine = [command, ...args].join(" ");
    return spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", commandLine], {
      cwd: projectRoot,
      stdio: "inherit",
      env,
      windowsHide: false,
    });
  }

  return spawn(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    env,
    shell: false,
  });
}

function waitForHttp(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }

        retry();
      });

      req.on("error", retry);
      req.setTimeout(1500, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() >= deadline) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }

      setTimeout(attempt, 300);
    };

    attempt();
  });
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  const terminate = (child) => {
    if (!child || child.killed) {
      return;
    }

    try {
      if (process.platform === "win32" && child.pid) {
        spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `taskkill /PID ${child.pid} /T /F >NUL 2>&1`], {
          cwd: projectRoot,
          stdio: "ignore",
          windowsHide: true,
        });
      } else {
        child.kill("SIGTERM");
      }
    } catch {
      // Ignore shutdown errors.
    }
  };

  terminate(electronProcess);
  terminate(viteProcess);
  removeSessionFile();

  setTimeout(() => process.exit(code), 250);
}

async function main() {
  cleanupPreviousSessionFile();
  cleanupStaleWindowsDevProcesses();
  await wait(250);

  const port = await findAvailablePort(preferredPort);
  const rendererUrl = `http://localhost:${port}`;
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

  console.log(`[dev] Starting Vite on ${rendererUrl}`);

  viteProcess = spawnProcess(npmCommand, ["run", "dev", "--", "--port", String(port), "--strictPort"]);
  writeSessionFile();

  viteProcess.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[dev] Vite exited with code ${code ?? 1}`);
      shutdown(code ?? 1);
    }
  });

  await waitForHttp(rendererUrl);

  console.log(`[dev] Starting Electron against ${rendererUrl}`);

  electronProcess = spawnProcess(
    npmCommand,
    ["run", "electron:dev"],
    {
      ELECTRON_RENDERER_URL: rendererUrl,
      ELECTRON_RUN_AS_NODE: null,
    }
  );
  writeSessionFile();

  electronProcess.on("exit", (code) => {
    if (!shuttingDown) {
      shutdown(code ?? 0);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

main().catch(async (error) => {
  console.error(`[dev] ${error.message}`);
  await wait(50);
  shutdown(1);
});
