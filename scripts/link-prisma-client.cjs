const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const generatedClientDir = path.join(projectRoot, "node_modules", ".prisma");
const prismaPackageClientDir = path.join(projectRoot, "node_modules", "@prisma", "client", ".prisma");

if (!fs.existsSync(generatedClientDir)) {
  console.warn("[prisma] generated client directory not found; skipping link");
  process.exit(0);
}

fs.rmSync(prismaPackageClientDir, { recursive: true, force: true });

try {
  fs.symlinkSync(generatedClientDir, prismaPackageClientDir, "junction");
} catch (error) {
  fs.cpSync(generatedClientDir, prismaPackageClientDir, { recursive: true });
  console.warn("[prisma] symlink failed; copied generated client instead", error);
}
