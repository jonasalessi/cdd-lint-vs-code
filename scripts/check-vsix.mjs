import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yauzl from "yauzl";

const extensionFolder = "extension/";
const allowedFiles = [
  "dist/extension.js",
  "package.json",
  "readme.md",
  "changelog.md",
  "license.txt",
];

function defaultVsixPath() {
  const manifest = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  return resolve(`${manifest.name}-${manifest.version}.vsix`);
}

function openVsix(vsixPath) {
  return new Promise((resolveOpen, rejectOpen) => {
    yauzl.open(vsixPath, { lazyEntries: false }, (error, zipFile) =>
      error ? rejectOpen(error) : resolveOpen(zipFile),
    );
  });
}

async function listEntryNames(vsixPath) {
  const zipFile = await openVsix(vsixPath);
  const entryNames = [];
  return new Promise((resolveList, rejectList) => {
    zipFile.on("entry", (entry) => entryNames.push(entry.fileName));
    zipFile.on("end", () => resolveList(entryNames));
    zipFile.on("error", rejectList);
  });
}

function isFile(entryName) {
  return !entryName.endsWith("/");
}

function listExtensionFiles(entryNames) {
  return entryNames
    .filter((entryName) => entryName.startsWith(extensionFolder) && isFile(entryName))
    .map((entryName) => entryName.slice(extensionFolder.length));
}

function findFilesNotAllowed(extensionFiles) {
  return extensionFiles.filter((file) => !allowedFiles.includes(file.toLowerCase()));
}

function findMissingFiles(extensionFiles) {
  const presentFiles = extensionFiles.map((file) => file.toLowerCase());
  return allowedFiles.filter((file) => !presentFiles.includes(file));
}

function reportProblems(label, files) {
  files.forEach((file) => console.error(`${label}: ${extensionFolder}${file}`));
}

const vsixPath = process.argv[2] ? resolve(process.argv[2]) : defaultVsixPath();
const extensionFiles = listExtensionFiles(await listEntryNames(vsixPath));
const filesNotAllowed = findFilesNotAllowed(extensionFiles);
const missingFiles = findMissingFiles(extensionFiles);

reportProblems("File not allowed in the VSIX", filesNotAllowed);
reportProblems("File missing from the VSIX", missingFiles);

if (filesNotAllowed.length + missingFiles.length > 0) {
  process.exit(1);
}
console.log(`${vsixPath} is valid: ${extensionFiles.length} files in ${extensionFolder}`);
