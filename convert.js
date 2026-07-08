import XLSX from "xlsx";
import fs from "fs";

// =====================================
// Load Excel Workbook
// =====================================

const workbook = XLSX.readFile("cca_database.xlsx");

// Read the first worksheet
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// Convert worksheet to JSON
const rows = XLSX.utils.sheet_to_json(sheet, {
  defval: ""
});

// =====================================
// Helper Functions
// =====================================

// Split cells with line breaks
function splitLines(value) {
  if (!value) return [];

  return value
    .toString()
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

// Split comma-separated cells
function splitComma(value) {
  if (!value) return [];

  return value
    .toString()
    .split(",")
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

// Clean normal text
function clean(value) {
  if (!value) return "";

  return value.toString().trim();
}

// Preserve line breaks for training schedule
function cleanTraining(value) {
  if (!value) return "";

  return value
    .toString()
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

// Remove quotation marks from Instagram usernames
function cleanInstagram(value) {
  if (!value) return "";

  return value
    .toString()
    .replace(/"/g, "")
    .trim();
}

// =====================================
// Convert Excel Rows
// =====================================

const database = rows.map(row => ({

  name: clean(row.Name),

  category: clean(row.Category),

  description: clean(row.Description),

  keywords: splitLines(row.Keywords),

  synonyms: splitComma(row.Synonyms),

  interests: splitComma(row.Interests),

  training: cleanTraining(row["Training Days/ Meeting Days"]),

  achievements: splitLines(row["Achievements/ Features/ Highlights"]),

  advisor: clean(row["Staff Advisor"]),

  instagram: cleanInstagram(row.Instagram)

}));

// =====================================
// Save JSON
// =====================================

fs.writeFileSync(
  "cca_data.json",
  JSON.stringify(database, null, 2),
  "utf8"
);

console.log(`✅ Successfully converted ${database.length} CCAs.`);