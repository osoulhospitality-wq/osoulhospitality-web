import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
fs.copyFileSync(path.join(root, "site-v14.css"), path.join(root, "site-v15.css"));
fs.copyFileSync(path.join(root, "site-hostinger-v14.js"), path.join(root, "site-hostinger-v15.js"));

let changed = 0;
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (entry.name.endsWith(".html")) {
      const current = fs.readFileSync(absolute, "utf8");
      const next = current.replaceAll("/site-hostinger-v14.js", "/site-hostinger-v15.js");
      if (next !== current) {
        fs.writeFileSync(absolute, next, "utf8");
        changed += 1;
      }
    }
  }
}
walk(root);
console.log(`Created v15 runtime assets and updated ${changed} HTML files.`);
