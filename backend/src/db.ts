import Database from 'better-sqlite3';
import path from 'path';
import { constants as fsConstants, existsSync, mkdirSync, accessSync, statSync } from 'fs';
import bcrypt from 'bcryptjs';
import { WEEKLY_STATUS_BOARD_DEFINITIONS } from './weekly-status';

const configuredDatabasePath = String(process.env.DATABASE_PATH || process.env.SQLITE_DB_PATH || '').trim();
const configuredDataDir = String(process.env.DATA_DIR || process.env.DATABASE_DIR || '').trim();
const defaultDataDir = path.join(process.cwd(), 'data');

export const databaseDirectory = configuredDatabasePath
  ? path.dirname(path.resolve(configuredDatabasePath))
  : path.resolve(configuredDataDir || defaultDataDir);

if (!existsSync(databaseDirectory)) {
  mkdirSync(databaseDirectory, { recursive: true });
}

export const databasePath = configuredDatabasePath
  ? path.resolve(configuredDatabasePath)
  : path.join(databaseDirectory, 'nbcuniversal.db');

export const db = new Database(databasePath);

db.pragma('journal_mode = WAL');

export function getDatabaseHealthInfo() {
  const databaseExists = existsSync(databasePath);
  let databaseWritable = false;
  let databaseSizeBytes = 0;

  try {
    accessSync(databaseDirectory, fsConstants.R_OK | fsConstants.W_OK);
    databaseWritable = true;
  } catch {
    databaseWritable = false;
  }

  if (databaseExists) {
    try {
      databaseSizeBytes = statSync(databasePath).size;
    } catch {
      databaseSizeBytes = 0;
    }
  }

  return {
    path: databasePath,
    directory: databaseDirectory,
    exists: databaseExists,
    writable: databaseWritable,
    sizeBytes: databaseSizeBytes,
    configuredPath: configuredDatabasePath || null,
    configuredDirectory: configuredDataDir || null
  };
}

db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL,
    password TEXT
  );
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS drivers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL
  );
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    shortDescription TEXT,
    imageUrl TEXT,
    price REAL DEFAULT 0,
    inStock INTEGER DEFAULT 1
  );
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customerName TEXT,
    customerPhone TEXT,
    customerEmail TEXT,
    deliveryAddress TEXT,
    distanceKm REAL DEFAULT 0,
    deliveryFee REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    stage TEXT DEFAULT 'orders',
    paymentStatus TEXT DEFAULT 'pending',
    paymentProvider TEXT,
    paymentPhone TEXT,
    riderName TEXT,
    riderPhone TEXT,
    createdAt TEXT,
    deliveredAt TEXT
  );
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orderId INTEGER NOT NULL,
    productId INTEGER,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL,
    comment TEXT,
    FOREIGN KEY(orderId) REFERENCES orders(id),
    FOREIGN KEY(productId) REFERENCES products(id)
  );
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS enquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    productSlug TEXT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    question TEXT NOT NULL,
    responded INTEGER DEFAULT 0,
    responderName TEXT,
    respondedAt TEXT,
    createdAt TEXT NOT NULL
  );
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS test_runs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key TEXT,
    resultUrl TEXT,
    data TEXT,
    resultHtml TEXT,
    reportZip BLOB,
    createdAt TEXT NOT NULL,
    expiresAt TEXT,
    passed INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    skipped INTEGER DEFAULT 0,
    total INTEGER DEFAULT 0
  );
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS weekly_board_definitions (
    id TEXT PRIMARY KEY,
    sn INTEGER NOT NULL,
    platform TEXT NOT NULL,
    platformLabel TEXT NOT NULL,
    suite TEXT NOT NULL,
    suiteLabel TEXT NOT NULL,
    testCases INTEGER DEFAULT 0,
    applicationCoverage REAL,
    automationScripts INTEGER DEFAULT 0,
    coveragePercent REAL DEFAULT 0,
    supportedExecutionTypes TEXT NOT NULL,
    tagAliases TEXT NOT NULL
  );
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS weekly_automation_executions (
    id TEXT PRIMARY KEY,
    boardId TEXT NOT NULL,
    jobId TEXT,
    label TEXT NOT NULL,
    platform TEXT NOT NULL,
    suite TEXT NOT NULL,
    tag TEXT,
    environment TEXT,
    browser TEXT,
    deviceType TEXT,
    executionType TEXT NOT NULL,
    executedAt TEXT NOT NULL,
    executedWeekStart TEXT NOT NULL,
    executedWeekEnd TEXT NOT NULL,
    totalAutomated INTEGER DEFAULT 0,
    passed INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    passRate REAL DEFAULT 0,
    testCases INTEGER DEFAULT 0,
    applicationCoverage REAL,
    automationScripts INTEGER DEFAULT 0,
    coveragePercent REAL DEFAULT 0,
    resultsLink TEXT,
    queueId INTEGER,
    queueUrl TEXT,
    buildUrl TEXT,
    buildNumber INTEGER,
    runPrefix TEXT,
    status TEXT NOT NULL,
    errorMessage TEXT
  );
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS execute_test_runs (
    id INTEGER PRIMARY KEY,
    status TEXT NOT NULL,
    who TEXT NOT NULL,
    timeLabel TEXT,
    dateLabel TEXT,
    environment TEXT,
    feature TEXT,
    displayLabel TEXT,
    runType TEXT NOT NULL,
    featureFiles TEXT,
    browser TEXT,
    deviceType TEXT,
    branch TEXT,
    comment TEXT,
    jira TEXT,
    queueUrl TEXT,
    buildUrl TEXT,
    buildNumber INTEGER,
    queueId INTEGER,
    note TEXT,
    runPrefix TEXT,
    testJsonUrl TEXT,
    resultUrl TEXT,
    artifactError TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    weeklyExecutionId TEXT
  );
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_weekly_board_definitions_platform_suite
  ON weekly_board_definitions (platform, suite);
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_weekly_exec_week
  ON weekly_automation_executions (executedWeekStart, executedWeekEnd, platform, suite, executionType, executedAt);
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_weekly_exec_queue
  ON weekly_automation_executions (queueId);
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_execute_test_runs_created_at
  ON execute_test_runs (createdAt DESC, id DESC);
`).run();

// Lightweight migrations for older DBs (SQLite doesn't support IF NOT EXISTS on columns)
function ensureTestRunsSchema() {
  const columns = db
    .prepare(`PRAGMA table_info(test_runs)`)
    .all()
    .map((c: any) => c.name) as string[];

  const addColumn = (name: string, def: string) => {
    if (columns.includes(name)) return;
    try {
      db.prepare(`ALTER TABLE test_runs ADD COLUMN ${name} ${def}`).run();
    } catch {
      // ignore; column may already exist from another process
    }
  };

  addColumn('resultHtml', 'TEXT');
  addColumn('reportZip', 'BLOB');
  addColumn('expiresAt', 'TEXT');

  // Optional uniqueness by key (allows easy upserts by key)
  try {
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_test_runs_key ON test_runs(key)').run();
  } catch {
    // ignore
  }
}

ensureTestRunsSchema();

function ensureExecuteTestRunsSchema() {
  const columns = db
    .prepare(`PRAGMA table_info(execute_test_runs)`)
    .all()
    .map((c: any) => c.name) as string[];

  const addColumn = (name: string, def: string) => {
    if (columns.includes(name)) return;
    try {
      db.prepare(`ALTER TABLE execute_test_runs ADD COLUMN ${name} ${def}`).run();
    } catch {
      // ignore; column may already exist from another process
    }
  };

  addColumn('displayLabel', 'TEXT');
  addColumn('featureFiles', 'TEXT');
  addColumn('browser', 'TEXT');
  addColumn('deviceType', 'TEXT');
  addColumn('branch', 'TEXT');
  addColumn('comment', 'TEXT');
  addColumn('jira', 'TEXT');
  addColumn('queueUrl', 'TEXT');
  addColumn('buildUrl', 'TEXT');
  addColumn('buildNumber', 'INTEGER');
  addColumn('queueId', 'INTEGER');
  addColumn('note', 'TEXT');
  addColumn('runPrefix', 'TEXT');
  addColumn('testJsonUrl', 'TEXT');
  addColumn('resultUrl', 'TEXT');
  addColumn('artifactError', 'TEXT');
  addColumn('updatedAt', 'TEXT');
  addColumn('weeklyExecutionId', 'TEXT');
}

ensureExecuteTestRunsSchema();

function ensureWeeklyBoardDefinitionsSeedData() {
  const insert = db.prepare(`
    INSERT INTO weekly_board_definitions (
      id,
      sn,
      platform,
      platformLabel,
      suite,
      suiteLabel,
      testCases,
      applicationCoverage,
      automationScripts,
      coveragePercent,
      supportedExecutionTypes,
      tagAliases
    ) VALUES (
      @id,
      @sn,
      @platform,
      @platformLabel,
      @suite,
      @suiteLabel,
      @testCases,
      @applicationCoverage,
      @automationScripts,
      @coveragePercent,
      @supportedExecutionTypes,
      @tagAliases
    )
    ON CONFLICT(id) DO NOTHING
  `);

  const seedMany = db.transaction((rows: typeof WEEKLY_STATUS_BOARD_DEFINITIONS) => {
    for (const row of rows) {
      insert.run({
        ...row,
        applicationCoverage: row.applicationCoverage ?? null,
        supportedExecutionTypes: JSON.stringify(row.supportedExecutionTypes),
        tagAliases: JSON.stringify(row.tagAliases)
      });
    }
  });

  seedMany(WEEKLY_STATUS_BOARD_DEFINITIONS);
}

ensureWeeklyBoardDefinitionsSeedData();

const seedProducts = [
  { slug: 'chili', name: 'Chili Peppers', imageUrl: '/assets/images/chili.png', shortDescription: 'Sun-ripened organic chili peppers with warm Ghanaian heat.', price: 20, inStock: 1 },
  { slug: 'tomato', name: 'Tomatoes', imageUrl: '/assets/images/tomato.png', shortDescription: 'Juicy, sweet, vine-ripened organic tomatoes for rich stews.', price: 18, inStock: 1 },
  { slug: 'onion', name: 'Onions', imageUrl: '/assets/images/onion.png', shortDescription: 'Flavorful organic onions, the start of every good meal.', price: 16, inStock: 1 },
  { slug: 'cucumber', name: 'Cucumbers', imageUrl: '/assets/images/cucumber.png', shortDescription: 'Crisp, refreshing cucumbers grown in cool soil beds.', price: 15, inStock: 1 },
  { slug: 'carrot', name: 'Carrots', imageUrl: '/assets/images/carrot.png', shortDescription: 'Sweet, crunchy organic carrots perfect for families.', price: 14, inStock: 1 },
  { slug: 'beet', name: 'Beets', imageUrl: '/assets/images/beet.png', shortDescription: 'Deep-colored beets rich in natural minerals.', price: 17, inStock: 1 },
  { slug: 'turmeric', name: 'Turmeric', imageUrl: '/assets/images/turmeric.png', shortDescription: 'Golden organic turmeric root full of natural goodness.', price: 19, inStock: 1 }
];

const existingProducts = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
if (existingProducts.count === 0) {
  const insert = db.prepare('INSERT INTO products (slug, name, imageUrl, shortDescription, price, inStock) VALUES (@slug, @name, @imageUrl, @shortDescription, @price, @inStock)');
  const insertMany = db.transaction((rows: typeof seedProducts) => {
    for (const row of rows) insert.run(row);
  });
  insertMany(seedProducts);
}

const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
if (existingUsers.count === 0) {
  const hash = bcrypt.hashSync('password123', 10);
  db.prepare('INSERT INTO users (name, email, role, password) VALUES (?, ?, ?, ?)').run('Super Admin', 'super@nbcuniversal.com', 'super-admin', hash);
  db.prepare('INSERT INTO users (name, email, role, password) VALUES (?, ?, ?, ?)').run('Manager User', 'manager@nbcuniversal.com', 'manager', hash);
  db.prepare('INSERT INTO users (name, email, role, password) VALUES (?, ?, ?, ?)').run('Sales User', 'sales@nbcuniversal.com', 'sales', hash);
  db.prepare('INSERT INTO users (name, email, role, password) VALUES (?, ?, ?, ?)').run('Driver User', 'driver@nbcuniversal.com', 'driver', hash);
}

const existingDrivers = db.prepare('SELECT COUNT(*) as count FROM drivers').get() as { count: number };
if (existingDrivers.count === 0) {
  const insertDriver = db.prepare('INSERT INTO drivers (name, phone) VALUES (?, ?)');
  insertDriver.run('Kwesi Mensah', '0501 000 001');
  insertDriver.run('Adwoa Yeboah', '0501 000 002');
  insertDriver.run('Kojo Boadi', '0501 000 003');
}

export function stageToStatus(stage: string): string {
  if (stage === 'delivered') return 'completed';
  if (stage === 'assign' || stage === 'inroute') return 'out_for_delivery';
  return 'pending';
  
}
