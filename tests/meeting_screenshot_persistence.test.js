const fs = require("fs");
const path = require("path");
const assert = require("assert");

const intelligenceManagerPath = path.join(
  __dirname,
  "..",
  "electron",
  "IntelligenceManager.ts"
);

const source = fs.readFileSync(intelligenceManagerPath, "utf8");

assert(
  !source.includes("this.currentScreenshots.pop()"),
  "Meeting screenshots should not be destructively popped during answer generation."
);

assert(
  source.includes("screenshots: [...this.currentScreenshots]"),
  "Meeting stop snapshot should capture screenshots before state reset."
);

assert(
  source.includes("screenshots: snapshot.screenshots"),
  "Placeholder meetings should persist screenshots immediately."
);

assert(
  source.includes("screenshots: [...data.screenshots]"),
  "Final processed meetings should persist the snapshot screenshot set."
);

console.log("meeting screenshot persistence regression checks passed");
