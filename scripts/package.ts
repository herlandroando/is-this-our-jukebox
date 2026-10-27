import { spawn } from "bun";
import { statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRYPOINT = join(ROOT, "backend", "src", "server.ts");

const args = process.argv.slice(2);
const isAll = args.includes("--all");
const targetArg = args.find((a) => a.startsWith("--target="))?.split("=")[1];
const outfileArg = args.find((a) => a.startsWith("--outfile="))?.split("=")[1];

interface CompileTarget {
  name: string;
  bunTarget?: string;
  defaultOutfile: string;
  description: string;
}

const KNOWN_TARGETS: Record<string, CompileTarget> = {
  "windows": {
    name: "windows-x64",
    bunTarget: "bun-windows-x64",
    defaultOutfile: "jukebox-office.exe",
    description: "Windows (x64)",
  },
  "windows-x64": {
    name: "windows-x64",
    bunTarget: "bun-windows-x64",
    defaultOutfile: "jukebox-office-windows-x64.exe",
    description: "Windows (x64)",
  },
  "mac": {
    name: "darwin-arm64",
    bunTarget: "bun-darwin-arm64",
    defaultOutfile: "jukebox-office-darwin-arm64",
    description: "macOS Apple Silicon (ARM64)",
  },
  "mac-arm64": {
    name: "darwin-arm64",
    bunTarget: "bun-darwin-arm64",
    defaultOutfile: "jukebox-office-darwin-arm64",
    description: "macOS Apple Silicon (ARM64)",
  },
  "darwin-arm64": {
    name: "darwin-arm64",
    bunTarget: "bun-darwin-arm64",
    defaultOutfile: "jukebox-office-darwin-arm64",
    description: "macOS Apple Silicon (ARM64)",
  },
  "mac-x64": {
    name: "darwin-x64",
    bunTarget: "bun-darwin-x64",
    defaultOutfile: "jukebox-office-darwin-x64",
    description: "macOS Intel (x64)",
  },
  "darwin-x64": {
    name: "darwin-x64",
    bunTarget: "bun-darwin-x64",
    defaultOutfile: "jukebox-office-darwin-x64",
    description: "macOS Intel (x64)",
  },
  "linux": {
    name: "linux-x64",
    bunTarget: "bun-linux-x64",
    defaultOutfile: "jukebox-office-linux-x64",
    description: "Linux (x64)",
  },
  "linux-x64": {
    name: "linux-x64",
    bunTarget: "bun-linux-x64",
    defaultOutfile: "jukebox-office-linux-x64",
    description: "Linux (x64)",
  },
  "linux-arm64": {
    name: "linux-arm64",
    bunTarget: "bun-linux-arm64",
    defaultOutfile: "jukebox-office-linux-arm64",
    description: "Linux (ARM64)",
  },
};

function getHostTarget(): CompileTarget {
  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";
  const isLinux = process.platform === "linux";
  const arch = process.arch;

  if (isWin) {
    return {
      name: `windows-${arch}`,
      defaultOutfile: "jukebox-office.exe",
      description: `Windows (${arch}) [Host]`,
    };
  }
  if (isMac) {
    return {
      name: `darwin-${arch}`,
      defaultOutfile: "jukebox-office",
      description: `macOS (${arch}) [Host]`,
    };
  }
  return {
    name: `linux-${arch}`,
    defaultOutfile: "jukebox-office",
    description: `Linux (${arch}) [Host]`,
  };
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

async function compileBinary(target: CompileTarget, customOutfile?: string): Promise<boolean> {
  const outfile = customOutfile || target.defaultOutfile;
  const outPath = join(ROOT, outfile);

  const cmd: string[] = ["bun", "build", "--compile", "--minify"];
  if (target.bunTarget) {
    cmd.push(`--target=${target.bunTarget}`);
  }
  cmd.push(`--outfile=${outPath}`, ENTRYPOINT);

  console.log(`\n📦 Compiling for ${target.description}...`);
  console.log(`   Output: ${outfile}`);

  const start = Date.now();
  const proc = spawn(cmd, {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;
  const duration = ((Date.now() - start) / 1000).toFixed(2);

  if (exitCode !== 0) {
    console.error(`❌ Build failed for ${target.description} (exit code ${exitCode})`);
    return false;
  }

  if (existsSync(outPath)) {
    const stats = statSync(outPath);
    console.log(`✅ Finished ${target.description} -> ${outfile} (${formatBytes(stats.size)}) in ${duration}s`);
  } else {
    console.log(`✅ Finished ${target.description} in ${duration}s`);
  }
  return true;
}

async function main() {
  console.log("=======================================================");
  console.log(" 🎵 IsThisOurJukebox Standalone Package Builder");
  console.log("=======================================================");

  if (isAll) {
    const allTargets: CompileTarget[] = [
      KNOWN_TARGETS["windows-x64"],
      KNOWN_TARGETS["darwin-arm64"],
      KNOWN_TARGETS["darwin-x64"],
      KNOWN_TARGETS["linux-x64"],
      KNOWN_TARGETS["linux-arm64"],
    ];

    console.log(`Building all ${allTargets.length} cross-platform targets...`);
    let successCount = 0;
    for (const t of allTargets) {
      const ok = await compileBinary(t);
      if (ok) successCount++;
    }
    console.log("\n=======================================================");
    console.log(`🎉 Built ${successCount}/${allTargets.length} packages successfully!`);
    console.log("=======================================================\n");
    if (successCount < allTargets.length) process.exit(1);
    return;
  }

  if (targetArg) {
    const target = KNOWN_TARGETS[targetArg.toLowerCase()];
    if (!target) {
      console.error(`❌ Unknown target: "${targetArg}".`);
      console.error(`Available targets: ${Object.keys(KNOWN_TARGETS).join(", ")}`);
      process.exit(1);
    }
    const ok = await compileBinary(target, outfileArg);
    if (!ok) process.exit(1);
    return;
  }

  // Default: package for current host
  const hostTarget = getHostTarget();
  const ok = await compileBinary(hostTarget, outfileArg);
  if (!ok) process.exit(1);
}

await main();
