import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import mysql from "mysql2/promise";

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const separator = argument.indexOf("=");
    return separator === -1
      ? [argument, true]
      : [argument.slice(0, separator), argument.slice(separator + 1)];
  }),
);
const snapshotDir = args.get("--snapshot-dir");
const targetLabel = args.get("--target");
const execute = args.get("--execute") === true;

if (typeof snapshotDir !== "string" || !path.isAbsolute(snapshotDir)) {
  throw new Error("--snapshot-dir must be an absolute path.");
}
if (targetLabel !== "arena" && targetLabel !== "portal") {
  throw new Error("--target must be arena or portal.");
}
if (execute && args.get("--confirm") !== "RESTORE-LOGICAL-SNAPSHOT") {
  throw new Error(
    "Restoration replaces every object in the selected database. " +
      "Pass --confirm=RESTORE-LOGICAL-SNAPSHOT to continue.",
  );
}

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replaceAll("`", "``")}\``;
}

async function connectUtc(url, label) {
  const connection = await mysql.createConnection({
    uri: url,
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
    timezone: "Z",
    multipleStatements: false,
  });
  await connection.query("SET time_zone = '+00:00'");
  const [[clock]] = await connection.query(
    "SELECT @@session.time_zone AS session_time_zone, " +
      "TIMESTAMPDIFF(MICROSECOND, UTC_TIMESTAMP(6), CURRENT_TIMESTAMP(6)) AS utc_offset_microseconds",
  );
  if (
    String(clock.session_time_zone) !== "+00:00" ||
    Number(clock.utc_offset_microseconds) !== 0
  ) {
    await connection.end();
    throw new Error(`${label} did not establish a UTC database session.`);
  }
  return connection;
}

async function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const input = fs.createReadStream(file);
  input.on("data", (chunk) => hash.update(chunk));
  await new Promise((resolve, reject) => {
    input.on("end", resolve);
    input.on("error", reject);
  });
  return hash.digest("hex");
}

function snapshotLines(file) {
  return readline.createInterface({
    input: fs.createReadStream(file).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  });
}

function decodeValue(value) {
  if (value && typeof value === "object" && "$binaryBase64" in value) {
    return Buffer.from(value.$binaryBase64, "base64");
  }
  if (value && typeof value === "object" && "$bigint" in value) {
    return String(value.$bigint);
  }
  return value;
}

function portableTriggerSql(createSql) {
  return createSql.replace(
    /^CREATE\s+DEFINER=`[^`]+`@`[^`]+`\s+TRIGGER\s+/i,
    "CREATE TRIGGER ",
  );
}

const root = path.resolve(snapshotDir);
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
if (manifest.format !== "tappd-mysql-logical-snapshot-v1") {
  throw new Error("Unsupported snapshot format.");
}
const target = (manifest.targets ?? []).find((candidate) => candidate.label === targetLabel);
if (!target) throw new Error(`Snapshot has no ${targetLabel} target.`);
const file = path.resolve(root, target.file);
const relative = path.relative(root, file);
if (relative.startsWith("..") || path.isAbsolute(relative)) {
  throw new Error("Snapshot file escapes its manifest directory.");
}
if ((await sha256File(file)) !== target.sha256) {
  throw new Error("Snapshot SHA-256 does not match its manifest.");
}

let databaseHeader = null;
const objects = [];
const triggers = [];
const rowCounts = new Map();
for await (const line of snapshotLines(file)) {
  const record = JSON.parse(line);
  if (record.kind === "database") databaseHeader = record;
  if (record.kind === "object") objects.push(record);
  if (record.kind === "trigger") triggers.push(record);
  if (record.kind === "rows") {
    rowCounts.set(record.table, (rowCounts.get(record.table) ?? 0) + record.rows.length);
  }
}
if (!databaseHeader || databaseHeader.label !== targetLabel) {
  throw new Error("Snapshot database header does not match the selected target.");
}
const mismatches = (target.tables ?? []).filter(
  (table) => table.objectType === "BASE TABLE" &&
    (rowCounts.get(table.name) ?? 0) !== Number(table.rows),
);
if (objects.length !== (target.tables ?? []).length || mismatches.length) {
  throw new Error("Snapshot object or row counts are incomplete.");
}

if (!execute) {
  console.log(JSON.stringify({
    verified: true,
    target: targetLabel,
    schema: databaseHeader.schema,
    objects: objects.length,
    triggers: triggers.length,
    rows: [...rowCounts.values()].reduce((sum, value) => sum + value, 0),
  }, null, 2));
  process.exit(0);
}

const environmentKey = targetLabel === "arena" ? "GAME_DATABASE_URL" : "PORTAL_DATABASE_URL";
if (!process.env[environmentKey]) throw new Error(`${environmentKey} is required.`);
const connection = await connectUtc(process.env[environmentKey], targetLabel);
try {
  const [[current]] = await connection.query("SELECT DATABASE() AS schema_name");
  if (current.schema_name !== databaseHeader.schema) {
    throw new Error("Connected database does not match the snapshot schema.");
  }
  await connection.query("SET SESSION FOREIGN_KEY_CHECKS = 0");
  await connection.query("SET SESSION UNIQUE_CHECKS = 0");

  const [currentTriggers] = await connection.query(
    "SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()",
  );
  for (const trigger of currentTriggers) {
    await connection.query(`DROP TRIGGER ${quoteIdentifier(trigger.TRIGGER_NAME)}`);
  }
  const [currentObjects] = await connection.query(
    "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES " +
      "WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_TYPE = 'VIEW' DESC, TABLE_NAME",
  );
  for (const object of currentObjects) {
    const kind = object.TABLE_TYPE === "VIEW" ? "VIEW" : "TABLE";
    await connection.query(`DROP ${kind} IF EXISTS ${quoteIdentifier(object.TABLE_NAME)}`);
  }
  for (const object of objects.filter((object) => object.objectType === "BASE TABLE")) {
    await connection.query(object.createSql);
  }

  for await (const line of snapshotLines(file)) {
    const record = JSON.parse(line);
    if (record.kind !== "rows" || !record.rows.length) continue;
    const columns = Object.keys(record.rows[0]);
    const placeholders = record.rows
      .map(() => `(${columns.map(() => "?").join(",")})`)
      .join(",");
    const values = record.rows.flatMap((row) => columns.map((column) => decodeValue(row[column])));
    await connection.execute(
      `INSERT INTO ${quoteIdentifier(record.table)} ` +
        `(${columns.map(quoteIdentifier).join(",")}) VALUES ${placeholders}`,
      values,
    );
  }
  for (const object of objects.filter((object) => object.objectType === "VIEW")) {
    await connection.query(object.createSql);
  }
  for (const trigger of triggers) {
    await connection.query(portableTriggerSql(trigger.createSql));
  }
  await connection.query("SET SESSION UNIQUE_CHECKS = 1");
  await connection.query("SET SESSION FOREIGN_KEY_CHECKS = 1");
  console.log(JSON.stringify({ restored: true, target: targetLabel, schema: databaseHeader.schema }, null, 2));
} finally {
  try {
    await connection.query("SET SESSION UNIQUE_CHECKS = 1");
    await connection.query("SET SESSION FOREIGN_KEY_CHECKS = 1");
  } finally {
    await connection.end();
  }
}
