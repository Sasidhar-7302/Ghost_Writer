import launchConfigJson from "../../config/launch-config.json";

export type LaunchMode = "beta-free" | "paid";

export interface LaunchConfig {
    appName: string;
    productName: string;
    companyName: string;
    description: string;
    version: string;
    launchMode: LaunchMode;
    monetizationEnabled: boolean;
    telemetryDefaultEnabled: boolean;
    release: {
        owner: string;
        repo: string;
        tagPrefix: string;
        manifestFileName: string;
        checksumsFileName: string;
        notesFileName: string;
        windowsInstallerName: string;
        macZipName: string;
        macDmgName: string;
        installScriptWindows: string;
        installScriptMac: string;
        supportedPlatforms: Array<{
            id: string;
            platform: "windows" | "macos";
            arch: string;
            label: string;
        }>;
    };
    remoteServices: {
        supabaseUrl: string;
        supabaseAnonKey: string;
        gumroadProductPermalink: string;
        gumroadVerifyUrl: string;
    };
    support: {
        issuesUrl: string;
        downloadsUrl: string;
        rawContentBaseUrl: string;
        privacyDocPath: string;
        troubleshootingDocPath: string;
    };
}

export const launchConfig = launchConfigJson as LaunchConfig;

export const getReleaseTag = (version: string = launchConfig.version): string =>
    `${launchConfig.release.tagPrefix}${version}`;

export const getGitHubRepoUrl = (): string =>
    `https://github.com/${launchConfig.release.owner}/${launchConfig.release.repo}`;

export const getReleaseDownloadBaseUrl = (version: string = launchConfig.version): string =>
    `${getGitHubRepoUrl()}/releases/download/${getReleaseTag(version)}`;

export const getLatestDownloadUrl = (fileName: string): string =>
    `${getGitHubRepoUrl()}/releases/latest/download/${encodeURIComponent(fileName)}`;

export const getRawScriptUrl = (scriptName: string): string =>
    `${launchConfig.support.rawContentBaseUrl}/${scriptName}`;

export const isBetaFreeLaunch = (): boolean =>
    launchConfig.launchMode === "beta-free" || !launchConfig.monetizationEnabled;
