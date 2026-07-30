import { DatabaseSync } from "node:sqlite";

const APPLE_EPOCH_OFFSET_SECONDS = 978_307_200;

function appleTimestamp(isoDate: string) {
  return Date.parse(isoDate) / 1_000 - APPLE_EPOCH_OFFSET_SECONDS;
}

export function createFantasyMagicaBackup(path: string) {
  const database = new DatabaseSync(path);
  const startedAt = appleTimestamp("2025-03-14T12:00:00Z");
  const finishedAt = appleTimestamp("2025-03-14T12:45:00Z");

  try {
    database.exec(`
      CREATE TABLE ZLOCATION (
        Z_PK INTEGER PRIMARY KEY,
        ZLATITUDE REAL,
        ZLONGITUDE REAL,
        ZTIMESTAMP REAL,
        ZPERFORMANCE INTEGER
      );
      CREATE TABLE ZPERFORMANCE (
        Z_PK INTEGER PRIMARY KEY,
        ZSTARTDATE REAL,
        ZENDDATE REAL,
        ZTOTALDISTANCE REAL,
        ZSTARTADDRESSCITY TEXT,
        ZENDADDRESSCITY TEXT,
        ZAVERAGESPEED REAL,
        ZMAXSPEED REAL,
        ZDRIVINGSCORE REAL,
        ZNOTE TEXT,
        ZFORECASTSTATE TEXT,
        ZFORECASTTEMPERATURE REAL,
        ZTRIPCONSUMPTIONUNITS REAL,
        ZTRIPCONSUMPTIONCOST REAL,
        ZCO2 REAL,
        ZODOMETERSTART REAL,
        ZODOMETEREND REAL,
        ZSTARTPLACE INTEGER,
        ZENDPLACE INTEGER
      );
      CREATE TABLE ZPLACE (
        Z_PK INTEGER PRIMARY KEY,
        ZNAME TEXT,
        ZADDRESS TEXT,
        ZLATITUDE REAL,
        ZLONGITUDE REAL
      );
      CREATE TABLE ZTAG (Z_PK INTEGER PRIMARY KEY, ZTITLE TEXT);
      CREATE TABLE Z_13TAGS (Z_13PERFORMANCES INTEGER, Z_15TAGS1 INTEGER);
      CREATE TABLE ZBASECOREDATAOBJECT (
        Z_PK INTEGER PRIMARY KEY,
        Z_ENT INTEGER,
        ZFUELAMOUNT REAL,
        ZFUELAMOUNTCOST REAL
      );
      CREATE TABLE Z_PRIMARYKEY (Z_ENT INTEGER PRIMARY KEY, Z_NAME TEXT);
      CREATE TABLE ZODOMETERLOG (ZDATE REAL, ZVALUE REAL);
    `);

    database
      .prepare(
        `
      INSERT INTO ZPERFORMANCE VALUES (
        101, ?, ?, 42500, 'Moonhaven', 'Starfall Keep', 15, 25, 0.92,
        'A quiet road beneath two moons.', 'Clear', 18, 4.2, 12.4, 8600,
        120000, 120042.5, 1, 2
      )
    `,
      )
      .run(startedAt, finishedAt);
    database.prepare("INSERT INTO ZLOCATION VALUES (1, 12.1000, 34.1000, ?, 101)").run(startedAt);
    database
      .prepare("INSERT INTO ZLOCATION VALUES (2, 12.1500, 34.1500, ?, NULL)")
      .run(startedAt + 1_350);
    database.prepare("INSERT INTO ZLOCATION VALUES (3, 12.2000, 34.2000, ?, 101)").run(finishedAt);
    database.exec(`
      INSERT INTO ZPLACE VALUES (1, 'Moon Gate', '1 Crescent Way', 12.1000, 34.1000);
      INSERT INTO ZPLACE VALUES (2, 'Starfall Keep', '99 Comet Road', 12.2000, 34.2000);
      INSERT INTO ZTAG VALUES (1, 'starlight');
      INSERT INTO Z_13TAGS VALUES (101, 1);
      INSERT INTO Z_PRIMARYKEY VALUES (7, 'Supply');
      INSERT INTO ZBASECOREDATAOBJECT VALUES (1, 7, 20, 36);
    `);
    database.prepare("INSERT INTO ZODOMETERLOG VALUES (?, 120000)").run(startedAt);
    database.prepare("INSERT INTO ZODOMETERLOG VALUES (?, 120042.5)").run(finishedAt);
  } finally {
    database.close();
  }
}

export function createBackupWithoutLocationData(path: string) {
  const database = new DatabaseSync(path);
  try {
    database.exec("CREATE TABLE ZUNRELATED (Z_PK INTEGER PRIMARY KEY)");
  } finally {
    database.close();
  }
}
