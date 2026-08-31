import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
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
const targetLabel = args.get("--target");
const outputDir = args.get("--output-dir");

if (targetLabel !== "arena" && targetLabel !== "portal") {
  throw new Error("--target must be arena or portal.");
}
if (typeof outputDir !== "string" || !path.isAbsolute(outputDir)) {
  throw new Error("--output-dir must be an absolute path.");
}

const environmentKey =
  targetLabel === "arena" ? "GAME_DATABASE_URL" : "PORTAL_DATABASE_URL";
if (!process.env[environmentKey]) {
  throw new Error(`${environmentKey} is required.`);
}

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replaceAll("`", "``")}\``;
}

function portableObjectSql(createSql) {
  return String(createSql).replace(
    /\s+DEFINER=`[^`]+`@`[^`]+`/i,
    "",
  );
}

function encodeValue(value) {
  if (Buffer.isBuffer(value)) {
    return { $binaryBase64: value.toString("base64") };
  }
  if (typeof value === "bigint") {
    return { $bigint: value.toString() };
  }
  return value;
}

function encodeRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, encodeValue(value)]),
  );
}

async function connectUtc(url) {
  const connection = await mysql.createConnection({
    uri: url,
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
    timezone: "Z",
    multipleStatements: false,
  });
  await connection.query("SET SESSION time_zone = '+00:00'");
  const [[clock]] = await connection.query(
    "SELECT @@session.time_zone AS session_time_zone, " +
      "TIMESTAMPDIFF(MICROSECOND, UTC_TIMESTAMP(6), CURRENT_TIMESTAMP(6)) AS utc_offset_microseconds",
  );
  if (
    String(clock.session_time_zone) !== "+00:00" ||
    Number(clock.utc_offset_microseconds) !== 0
  ) {
    await connection.end();
    throw new Error("The snapshot connection did not establish a UTC session.");
  }
  return connection;
}

async function writeLine(stream, value) {
  if (!stream.write(`${JSON.stringify(value)}\n`)) {
    await once(stream, "drain");
  }
}

async function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const input = fs.createReadStream(file);
  input.on("data", (chunk) => hash.update(chunk));
  await Promise.race([
    once(input, "end"),
    once(input, "error").then(([error]) => Promise.reject(error)),
  ]);
  return hash.digest("hex");
}

const root = path.resolve(outputDir);
if (fs.existsSync(root)) {
  throw new Error("The output directory already exists; choose a new snapshot path.");
}
fs.mkdirSync(root, { recursive: false });

const startedAt = new Date().toISOString();
const fileName = `${targetLabel}.logical-snapshot.jsonl.gz`;
const outputFile = path.join(root, fileName);
const fileOutput = fs.createWriteStream(outputFile, { flags: "wx" });
const gzip = zlib.createGzip({ level: zlib.constants.Z_BEST_COMPRESSION });
gzip.pipe(fileOutput);

const connection = await connectUtc(process.env[environmentKey]);
let schema;
const tables = [];
let triggerCount = 0;
try {
  await connection.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
  const [[database]] = await connection.query(
    "SELECT DATABASE() AS schema_name, VERSION() AS server_version",
  );
  schema = String(database.schema_name);
  await writeLine(gzip, {
    kind: "database",
    label: targetLabel,
    schema,
    serverVersion: String(database.server_version),
    timezone: "UTC",
    createdAt: startedAt,
  });

  const [objects] = await connection.query(
    "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES " +
      "WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_TYPE = 'VIEW', TABLE_NAME",
  );
  for (const object of objects) {
    const name = String(object.TABLE_NAME);
    const objectType = String(object.TABLE_TYPE);
    const showSql =
      objectType === "VIEW"
        ? `SHOW CREATE VIEW ${quoteIdentifier(name)}`
        : `SHOW CREATE TABLE ${quoteIdentifier(name)}`;
    const [createRows] = await connection.query(showSql);
    const createSql =
      objectType === "VIEW"
        ? createRows[0]["Create View"]
        : createRows[0]["Create Table"];
    await writeLine(gzip, {
      kind: "object",
      name,
      objectType,
      createSql: portableObjectSql(createSql),
    });

    let rowCount = 0;
    if (objectType === "BASE TABLE") {
      const [rows] = await connection.query(`SELECT * FROM ${quoteIdentifier(name)}`);
      const batchSize = 1_000;
      for (let offset = 0; offset < rows.length; offset += batchSize) {
        const batch = rows.slice(offset, offset + batchSize).map(encodeRow);
        await writeLine(gzip, { kind: "rows", table: name, rows: batch });
      }
      rowCount = rows.length;
    }
    tables.push({ name, objectType, rows: rowCount });
  }

  const [triggers] = await connection.query(
    "SELECT TRIGGER_NAME FROM information_schema.TRIGGERS " +
      "WHERE TRIGGER_SCHEMA = DATABASE() ORDER BY TRIGGER_NAME",
  );
  for (const trigger of triggers) {
    const name = String(trigger.TRIGGER_NAME);
    const [createRows] = await connection.query(
      `SHOW CREATE TRIGGER ${quoteIdentifier(name)}`,
    );
    const createSql =
      createRows[0]["SQL Original Statement"] ?? createRows[0]["Create Trigger"];
    await writeLine(gzip, {
      kind: "trigger",
      name,
      createSql: portableObjectSql(createSql),
    });
    triggerCount += 1;
  }
  await connection.commit();
} catch (error) {
  try {
    await connection.rollback();
  } catch {
    // Preserve the snapshot failure.
  }
  gzip.destroy(error);
  throw error;
} finally {
  await connection.end();
}

gzip.end();
await Promise.race([
  once(fileOutput, "finish"),
  once(fileOutput, "error").then(([error]) => Promise.reject(error)),
]);

const target = {
  label: targetLabel,
  schema,
  file: fileName,
  sha256: await sha256File(outputFile),
  bytes: fs.statSync(outputFile).size,
  tables,
  triggers: triggerCount,
};
const manifest = {
  format: "tappd-mysql-logical-snapshot-v1",
  createdAt: startedAt,
  timezone: "UTC",
  targets: [target],
};
fs.writeFileSync(
  path.join(root, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  { flag: "wx" },
);

console.log(JSON.stringify({
  createdAt: startedAt,
  target: targetLabel,
  schema,
  objects: tables.length,
  triggers: triggerCount,
  rows: tables.reduce((sum, table) => sum + table.rows, 0),
  bytes: target.bytes,
  sha256: target.sha256,
  outputDir: root,
}, null, 2));
