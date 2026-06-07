import type { Database, SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

type InitSqlJs = (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>;

async function loadInitSqlJs(): Promise<InitSqlJs> {
  const sqlModule = await import('sql.js/dist/sql-wasm.js');
  const initSqlJs =
    (sqlModule as { default?: InitSqlJs }).default ?? (sqlModule as unknown as InitSqlJs);
  return initSqlJs;
}
import { logger } from '@/utils/logger';
import { clearSqliteBytes, loadSqliteBytes, saveSqliteBytes } from '@/lib/localDb/idbStorage';
import { clearPlacePhotoCache } from '@/lib/localDb/placePhotoCache';
import { LOCAL_DB_SCHEMA_STATEMENTS } from '@/lib/localDb/schema';

let sqlModule: SqlJsStatic | null = null;
let database: Database | null = null;
let initPromise: Promise<Database> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

async function loadSqlModule(): Promise<SqlJsStatic> {
  if (sqlModule) {
    return sqlModule;
  }

  const initSqlJs = await loadInitSqlJs();
  sqlModule = await initSqlJs({
    locateFile: () => wasmUrl,
  });
  return sqlModule;
}

function applySchema(db: Database): void {
  for (const statement of LOCAL_DB_SCHEMA_STATEMENTS) {
    db.run(statement);
  }
}

function schedulePersist(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistDatabase();
  }, 150);
}

export async function persistDatabase(): Promise<void> {
  if (!database) {
    return;
  }

  try {
    const bytes = database.export();
    await saveSqliteBytes(bytes);
  } catch (error) {
    logger.error('Failed to persist local database:', error);
  }
}

async function createDatabase(): Promise<Database> {
  const SQL = await loadSqlModule();
  const existingBytes = await loadSqliteBytes();
  const db = existingBytes ? new SQL.Database(existingBytes) : new SQL.Database();
  applySchema(db);
  return db;
}

export async function initLocalDatabase(): Promise<Database> {
  if (database) {
    return database;
  }

  if (!initPromise) {
    initPromise = createDatabase()
      .then((db) => {
        database = db;
        return db;
      })
      .catch((error) => {
        initPromise = null;
        throw error;
      });
  }

  return initPromise;
}

export async function getLocalDatabase(): Promise<Database | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return await initLocalDatabase();
  } catch (error) {
    logger.error('Failed to initialize local database:', error);
    return null;
  }
}

export function runWrite(callback: (db: Database) => void): void {
  if (!database) {
    return;
  }

  callback(database);
  schedulePersist();
}

export async function runWriteAsync(callback: (db: Database) => void): Promise<void> {
  const db = await getLocalDatabase();
  if (!db) {
    return;
  }

  callback(db);
  schedulePersist();
}

export async function clearLocalDatabase(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }

  if (database) {
    database.close();
    database = null;
  }

  initPromise = null;
  await clearSqliteBytes();
  await clearPlacePhotoCache();
}
