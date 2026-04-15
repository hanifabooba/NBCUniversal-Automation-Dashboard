import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { db, stageToStatus } from './db';
import crypto from 'crypto';
import zlib from 'zlib';
import {
  WEEKLY_AUTOMATION_JOBS,
  WEEKLY_STATUS_BOARD_DEFINITIONS,
  WeeklyAutomationJobDefinition,
  WeeklyExecutionType,
  WeeklyJobStatus,
  WeeklyPlatform,
  WeeklySuite,
  findWeeklyBoardDefinitionById,
  findWeeklyBoardDefinitionByTag,
  findWeeklyJobDefinitionById,
  resolveWorkingWeekRange
} from './weekly-status';

const app = express();
app.use(cors());
const apiBodyLimit = process.env.API_BODY_LIMIT || '50mb';
app.use(express.json({ limit: apiBodyLimit }));
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

type OrderStage = 'orders' | 'preparing' | 'assign' | 'inroute' | 'delivered';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const APP_PORT = Number(process.env.PORT || 3000);
const INTERNAL_BASE_URL = process.env.INTERNAL_BASE_URL || `http://127.0.0.1:${APP_PORT}`;

interface DbUser {
  id: number;
  name: string;
  email: string;
  role: string;
  password?: string;
}

function mapOrder(row: any) {
  return {
    id: row.id,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerEmail: row.customerEmail,
    deliveryAddress: row.deliveryAddress,
    distanceKm: row.distanceKm,
    deliveryFee: row.deliveryFee,
    status: row.status,
    stage: row.stage,
    paymentStatus: row.paymentStatus,
    paymentProvider: row.paymentProvider,
    paymentPhone: row.paymentPhone,
    riderName: row.riderName,
    riderPhone: row.riderPhone,
    createdAt: row.createdAt,
    deliveredAt: row.deliveredAt
  };
}

function getOrderWithItems(id: number) {
  const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!orderRow) return null;
  const items = db.prepare('SELECT * FROM order_items WHERE orderId = ?').all(id);
  return { ...mapOrder(orderRow), items };
}

function mapEnquiry(row: any) {
  return {
    id: row.id,
    productSlug: row.productSlug,
    name: row.name,
    phone: row.phone,
    email: row.email,
    question: row.question,
    responded: !!row.responded,
    responderName: row.responderName,
    respondedAt: row.respondedAt,
    createdAt: row.createdAt
  };
}

const transporter = (() => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
})();

function sendOrderEmail(order: any) {
  if (!transporter || !order?.customerEmail) {
    console.log('Email not sent (missing SMTP config or customer email). Order:', order?.id);
    return;
  }
  const itemsHtml =
    (order.items || [])
      .map(
        (item: any) =>
          `<li>${item.quantity} x ${item.name} — GHS ${item.price * item.quantity}${item.comment ? ` (Note: ${item.comment})` : ''}</li>`
      )
      .join('') || '<li>No items listed</li>';
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:4200';
  const trackLink = `${baseUrl}/order-confirmation/${order.id}`;

  const html = `
    <h2>Thanks for your order, ${order.customerName || 'customer'}!</h2>
    <p>Order #${order.id} is now pending fulfillment.</p>
    <p><strong>Delivery address:</strong> ${order.deliveryAddress || 'Not provided'}</p>
    <p><strong>Payment:</strong> MOMO (${order.paymentProvider || 'Ghana'}) · ${order.paymentPhone || 'N/A'}</p>
    <p><strong>Items:</strong></p>
    <ul>${itemsHtml}</ul>
    <p><strong>Total:</strong> GHS ${order.total || ''}</p>
    <p>Track your order here: <a href="${trackLink}">${trackLink}</a></p>
    <p>Thank you for choosing NBCuniversal Automation Execution.</p>
  `;

  transporter
    .sendMail({
      from: process.env.SMTP_FROM || 'no-reply@nbcuniversal.com',
      to: order.customerEmail,
      subject: `Order #${order.id} confirmation`,
      html
    })
    .catch((err: any) => console.error('Email send failed', err));
}

function sendEnquiryEmail(enquiry: any, responseMessage: string) {
  if (!transporter || !enquiry?.email) {
    console.log('Enquiry response email not sent (missing SMTP config or customer email). Enquiry:', enquiry?.id);
    return;
  }
  const subject = `Response to your enquiry${enquiry.productSlug ? ` about ${enquiry.productSlug}` : ''}`;
  const html = `
    <p>Hello ${enquiry.name},</p>
    <p>Thanks for reaching out about ${enquiry.productSlug || 'our products'}.</p>
    <p><strong>Your question:</strong><br/>${enquiry.question}</p>
    <p><strong>Our response:</strong><br/>${responseMessage}</p>
    <p>If you have any other questions, simply reply to this email.</p>
    <p>— NBCuniversal Automation Execution Support</p>
  `;
  transporter
    .sendMail({
      from: process.env.SMTP_FROM || 'no-reply@nbcuniversal.com',
      to: enquiry.email,
      subject,
      html
    })
    .catch((err: any) => console.error('Enquiry email send failed', err));
}

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });
  const normalized = String(email).toLowerCase();
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalized) as DbUser | undefined;

  // Backfill legacy users without passwords
  if (user && !user.password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, user.id);
    user = { ...user, password: hash };
  }

  if (!user || !user.password || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }
  const token = jwt.sign({ sub: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, role: user.role, name: user.name, email: user.email });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role = 'employee' } = req.body as { name: string; email: string; password: string; role?: string };
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password are required.' });
  const normalized = email.toLowerCase();
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(normalized) as DbUser | undefined;
  if (existing) return res.status(409).json({ message: 'User already exists.' });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (name, email, role, password) VALUES (?, ?, ?, ?)').run(name, normalized, role, hash);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalized) as DbUser;
  const token = jwt.sign({ sub: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '12h' });
  res.status(201).json({ token, role: user.role, name: user.name, email: user.email });
});

app.get('/api/products', (_req, res) => {
  const rows = db.prepare('SELECT * FROM products').all();
  res.json(rows);
});

app.post('/api/products', (req, res) => {
  const { name, shortDescription, imageUrl, price = 0, inStock = true } = req.body;
  if (!name || !shortDescription || !imageUrl) {
    return res.status(400).json({ message: 'Name, description, and image are required.' });
  }
  const slug = (name as string).toLowerCase().replace(/\s+/g, '-');
  try {
    db.prepare(
      'INSERT INTO products (slug, name, shortDescription, imageUrl, price, inStock) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(slug, name, shortDescription, imageUrl, price, inStock ? 1 : 0);
    const product = db.prepare('SELECT * FROM products WHERE slug = ?').get(slug);
    res.status(201).json(product);
  } catch (err) {
    res.status(400).json({ message: 'Could not create product', error: String(err) });
  }
});

app.get('/api/drivers', (_req, res) => {
  const drivers = db.prepare('SELECT * FROM drivers').all();
  res.json(drivers);
});

app.post('/api/drivers', (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) return res.status(400).json({ message: 'Name and phone are required.' });
  db.prepare('INSERT INTO drivers (name, phone) VALUES (?, ?)').run(name, phone);
  const driver = db.prepare('SELECT * FROM drivers WHERE name = ? ORDER BY id DESC').get(name);
  res.status(201).json(driver);
});

app.get('/api/orders', (_req, res) => {
  const orderRows: any[] = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  const itemsByOrder: Record<number, any[]> = {};
  const stmt = db.prepare('SELECT * FROM order_items WHERE orderId = ?');
  for (const row of orderRows) {
    itemsByOrder[row.id as number] = stmt.all(row.id as number);
  }
  const response = orderRows.map(row => ({ ...mapOrder(row), items: itemsByOrder[row.id as number] || [] }));
  res.json(response);
});

app.get('/api/orders/:id', (req, res) => {
  const id = Number(req.params.id);
  const order = getOrderWithItems(id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  res.json(order);
});

app.post('/api/orders', (req, res) => {
  const {
    customerName,
    customerPhone,
    customerEmail,
    deliveryAddress,
    distanceKm = 0,
    deliveryFee = 0,
    status = 'pending',
    stage = 'orders',
    paymentStatus = 'pending',
    paymentProvider,
    paymentPhone,
    riderName,
    riderPhone,
    items = []
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Items are required.' });
  }

  const insertOrder = db.prepare(`
    INSERT INTO orders
    (customerName, customerPhone, customerEmail, deliveryAddress, distanceKm, deliveryFee, status, stage, paymentStatus, paymentProvider, paymentPhone, riderName, riderPhone, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items (orderId, productId, name, price, quantity, comment)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  const txn = db.transaction(() => {
    const info = insertOrder.run(
      customerName ?? '',
      customerPhone ?? '',
      customerEmail ?? '',
      deliveryAddress ?? '',
      distanceKm,
      deliveryFee,
      status,
      stage,
      paymentStatus,
      paymentProvider ?? '',
      paymentPhone ?? '',
      riderName ?? '',
      riderPhone ?? '',
      now
    );
    const orderId = Number(info.lastInsertRowid);
    for (const item of items) {
      insertItem.run(orderId, item.productId ?? null, item.name, item.price, item.quantity, item.comment ?? '');
    }
    return orderId;
  });

  const orderId = txn();
  const order = getOrderWithItems(orderId);
  if (order) sendOrderEmail(order);
  res.status(201).json(order);
});

app.patch('/api/orders/:id/stage', (req, res) => {
  const id = Number(req.params.id);
  const { stage, riderName, riderPhone } = req.body as { stage: OrderStage; riderName?: string; riderPhone?: string };
  if (!stage) return res.status(400).json({ message: 'Stage is required' });
  const status = stageToStatus(stage);
  const deliveredAt = stage === 'delivered' ? new Date().toISOString() : null;
  const stmt = db.prepare(
    'UPDATE orders SET stage = ?, status = ?, riderName = COALESCE(?, riderName), riderPhone = COALESCE(?, riderPhone), deliveredAt = COALESCE(?, deliveredAt) WHERE id = ?'
  );
  const result = stmt.run(stage, status, riderName ?? null, riderPhone ?? null, deliveredAt, id);
  if (result.changes === 0) return res.status(404).json({ message: 'Order not found' });
  const order = getOrderWithItems(id);
  res.json(order);
});

app.post('/api/enquiries', (req, res) => {
  const { productSlug, name, phone, email, question } = req.body;
  if (!name || !phone || !question) {
    return res.status(400).json({ message: 'Name, phone, and question are required.' });
  }
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO enquiries (productSlug, name, phone, email, question, responded, createdAt)
       VALUES (?, ?, ?, ?, ?, 0, ?)`
    )
    .run(productSlug ?? null, name, phone, email ?? null, question, now);
  const created = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(Number(info.lastInsertRowid));
  res.status(201).json(mapEnquiry(created));
});

app.get('/api/enquiries', (_req, res) => {
  const rows = db.prepare('SELECT * FROM enquiries ORDER BY createdAt DESC').all();
  res.json(rows.map(mapEnquiry));
});

app.patch('/api/enquiries/:id/respond', (req, res) => {
  const id = Number(req.params.id);
  const { message, responderName } = req.body as { message: string; responderName?: string };
  if (!message) return res.status(400).json({ message: 'Message is required.' });
  const enquiry = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(id);
  if (!enquiry) return res.status(404).json({ message: 'Enquiry not found.' });

  const respondedAt = new Date().toISOString();
  db.prepare('UPDATE enquiries SET responded = 1, responderName = ?, respondedAt = ? WHERE id = ?').run(
    responderName ?? 'Team member',
    respondedAt,
    id
  );
  const updated = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(id);
  sendEnquiryEmail(updated, message);
  res.json(mapEnquiry(updated));
});

// --- Test runs storage (for pie charts) ---
type StoredRun = {
  id: string;
  name: string;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  createdAt: string;
};

const runsFile = path.join(__dirname, '../data/test-runs.json');
const envHealthFile = path.join(__dirname, '../data/env-health.json');
const latestTestFile = path.join(__dirname, '../data/latest-test.json');
const resultRunsFile = path.join(__dirname, '../data/result-runs.json');
const defaultS3Base = process.env.S3_BASE_URL || 'https://otsops-regression.s3.us-east-2.amazonaws.com';
const defaultRegion = process.env.AWS_REGION || 'us-east-2';
const presignExpirySeconds = Number(process.env.S3_PRESIGN_EXPIRY || 3600); // default 1 hour
const envHealthSyncHours = [8, 12, 17]; // local hours to auto-sync env health
const envHealthRunKeys = new Set<string>();

function normalizeTestResults(payload: any): any[] {
  const convertCucumber = (features: any[]): any[] | null => {
    if (!Array.isArray(features)) return null;
    const looksLikeCucumber = features.some(f => Array.isArray(f?.elements));
    if (!looksLikeCucumber) return null;
    const results: any[] = [];
    for (const feature of features) {
      const featureName = feature?.name || 'Feature';
      const elements = Array.isArray(feature?.elements) ? feature.elements : [];
      for (const el of elements) {
        const type = String(el?.type || '').toLowerCase();
        if (type && type !== 'scenario' && type !== 'scenario_outline') continue;
        const steps = Array.isArray(el?.steps) ? el.steps : [];
        let hasFail = false;
        let hasSkip = false;
        for (const step of steps) {
          const status = String(step?.result?.status || '').toUpperCase();
          if (status === 'FAIL' || status === 'FAILED') {
            hasFail = true;
          } else if (status === 'SKIP' || status === 'SKIPPED' || status === 'PENDING' || status === 'UNDEFINED') {
            hasSkip = true;
          }
        }
        const status = hasFail ? 'FAIL' : hasSkip ? 'SKIP' : 'PASS';
        results.push({
          name: `${featureName} — ${el?.name || 'Scenario'}`,
          status
        });
      }
    }
    return results;
  };

  if (Array.isArray(payload)) {
    const cucumber = convertCucumber(payload);
    if (cucumber) return cucumber;
    return payload;
  }
  if (Array.isArray(payload?.features)) {
    const cucumber = convertCucumber(payload.features);
    if (cucumber) return cucumber;
  }
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.tests)) return payload.tests;
  if (Array.isArray(payload?.testList)) return payload.testList;
  if (Array.isArray(payload?.test)) return payload.test;
  if (Array.isArray(payload?.report?.test)) return payload.report.test;
  if (Array.isArray(payload?.report?.tests)) return payload.report.tests;
  if (Array.isArray(payload?.data)) return payload.data;
  return payload ? [payload] : [];
}

function parseXmlSummary(xml: string): { total: number; passed: number; failed: number; skipped: number } | null {
  const readAttr = (text: string, attr: string): number | null => {
    const m = text.match(new RegExp(`\\b${attr}\\s*=\\s*["'](\\d+)["']`, 'i'));
    return m ? Number(m[1]) : null;
  };
  const countMatches = (text: string, pattern: RegExp): number => {
    const m = text.match(pattern);
    return m ? m.length : 0;
  };

  const testsuiteMatch = xml.match(/<testsuite\b[^>]*>/i);
  if (testsuiteMatch) {
    const tag = testsuiteMatch[0];
    const total = readAttr(tag, 'tests') ?? 0;
    const failures = readAttr(tag, 'failures') ?? 0;
    const errors = readAttr(tag, 'errors') ?? 0;
    const skipped = readAttr(tag, 'skipped') ?? 0;
    if (total > 0) {
      const failed = failures + errors;
      const passed = Math.max(0, total - failed - skipped);
      return { total, passed, failed, skipped };
    }
  }

  const testngMatch = xml.match(/<testng-results\b[^>]*>/i);
  if (testngMatch) {
    const tag = testngMatch[0];
    const total = readAttr(tag, 'total') ?? 0;
    const passed = readAttr(tag, 'passed') ?? 0;
    const failed = readAttr(tag, 'failed') ?? 0;
    const skipped = readAttr(tag, 'skipped') ?? 0;
    if (total > 0) {
      return { total, passed, failed, skipped };
    }
  }

  const testcases = countMatches(xml, /<testcase\b/gi);
  if (testcases > 0) {
    const failures = countMatches(xml, /<failure\b/gi);
    const errors = countMatches(xml, /<error\b/gi);
    const skipped = countMatches(xml, /<skipped\b/gi);
    const failed = failures + errors;
    const total = testcases;
    const passed = Math.max(0, total - failed - skipped);
    return { total, passed, failed, skipped };
  }

  return null;
}

async function fetchXmlSummary(candidateKeys: string[]): Promise<{ summary: { total: number; passed: number; failed: number; skipped: number }; usedKey: string; url: string } | null> {
  for (const key of candidateKeys) {
    if (!key) continue;
    const url = presignS3GetUrl(key) || s3UrlForKey(key);
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const text = await resp.text();
      const summary = parseXmlSummary(text);
      if (summary) {
        return { summary, usedKey: key, url };
      }
    } catch {
      // ignore and continue
    }
  }
  return null;
}

function unzipFirstEntry(buffer: Buffer): Buffer | null {
  // Find End of Central Directory (search backwards up to 64KB as per spec)
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;
  const minSearchOffset = Math.max(0, buffer.length - 0x10000 - 22);
  for (let i = buffer.length - 22; i >= minSearchOffset; i--) {
    if (buffer.readUInt32LE(i) === eocdSignature) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return null;

  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  const centralDirSig = buffer.readUInt32LE(centralDirOffset);
  if (centralDirSig !== 0x02014b50) return null;

  const compressionMethod = buffer.readUInt16LE(centralDirOffset + 10);
  const compressedSize = buffer.readUInt32LE(centralDirOffset + 20);
  const fileNameLength = buffer.readUInt16LE(centralDirOffset + 28);
  const extraLength = buffer.readUInt16LE(centralDirOffset + 30);
  const commentLength = buffer.readUInt16LE(centralDirOffset + 32);
  const localHeaderOffset = buffer.readUInt32LE(centralDirOffset + 42);

  const localSig = buffer.readUInt32LE(localHeaderOffset);
  if (localSig !== 0x04034b50) return null;
  const lhFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const lhExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + lhFileNameLength + lhExtraLength;
  const dataEnd = dataStart + compressedSize;
  if (dataEnd > buffer.length) throw new Error('Zip data truncated');
  const compressed = buffer.subarray(dataStart, dataEnd);

  if (compressionMethod === 0) return compressed; // stored
  if (compressionMethod === 8) return zlib.inflateRawSync(compressed); // deflate
  throw new Error(`Zip compression method ${compressionMethod} not supported`);
}

function parseBufferAsJson(buffer: Buffer): { data?: any[]; raw?: any; note?: string; error?: string } {
  const attempts: Array<{ fn: () => Buffer; note: string }> = [
    { fn: () => buffer, note: 'plain' },
    { fn: () => zlib.gunzipSync(buffer), note: 'gunzip' },
    { fn: () => zlib.inflateRawSync(buffer), note: 'inflateRaw' },
    { fn: () => unzipFirstEntry(buffer) as Buffer, note: 'zip' }
  ];

  for (const attempt of attempts) {
    try {
      const out = attempt.fn();
      if (!out) continue;
      const raw = JSON.parse(out.toString('utf8'));
      return { data: normalizeTestResults(raw), raw, note: attempt.note };
    } catch (err: any) {
      // ignore and try next
      if (attempt.note === 'zip' && err) {
        return { error: `Zip extract failed: ${err?.message || err}` };
      }
    }
  }
  return { error: 'Buffer did not contain valid JSON' };
}

function ensureRunsFile() {
  if (!fs.existsSync(path.dirname(runsFile))) {
    fs.mkdirSync(path.dirname(runsFile), { recursive: true });
  }
  if (!fs.existsSync(runsFile)) {
    fs.writeFileSync(runsFile, '[]', 'utf8');
  }
}

function ensureEnvHealthFile() {
  if (!fs.existsSync(path.dirname(envHealthFile))) {
    fs.mkdirSync(path.dirname(envHealthFile), { recursive: true });
  }
  if (!fs.existsSync(envHealthFile)) {
    fs.writeFileSync(envHealthFile, '[]', 'utf8');
  }
}

function ensureLatestTestFile() {
  if (!fs.existsSync(path.dirname(latestTestFile))) {
    fs.mkdirSync(path.dirname(latestTestFile), { recursive: true });
  }
}

function ensureResultRunsFile() {
  if (!fs.existsSync(path.dirname(resultRunsFile))) {
    fs.mkdirSync(path.dirname(resultRunsFile), { recursive: true });
  }
  if (!fs.existsSync(resultRunsFile)) {
    fs.writeFileSync(resultRunsFile, '[]', 'utf8');
  }
}

function loadRuns(): StoredRun[] {
  ensureRunsFile();
  try {
    const raw = fs.readFileSync(runsFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

function saveRuns(runs: StoredRun[]): void {
  ensureRunsFile();
  fs.writeFileSync(runsFile, JSON.stringify(runs, null, 2), 'utf8');
}

type EnvCheck = { name: string; status: string; detail?: string };
type EnvRun = { id: string; site: string; fetchedAt: string; weekOf: string; sourceUrl: string; checks: EnvCheck[] };
type StoredResultRun = {
  id: string;
  name: string;
  key?: string;
  resultUrl?: string;
  data?: any;
  createdAt: string;
  expiresAt?: string;
  passed?: number;
  failed?: number;
  skipped?: number;
  total?: number;
  hasResultHtml?: boolean;
  hasReportZip?: boolean;
  // Only loaded on-demand (avoid sending/rewriting huge blobs)
  resultHtml?: string;
  reportZip?: Buffer;
};

type StoredWeeklyExecution = {
  id: string;
  boardId: string;
  jobId?: string;
  label: string;
  platform: WeeklyPlatform;
  suite: WeeklySuite;
  tag?: string;
  environment?: string;
  browser?: string;
  deviceType?: string;
  executionType: WeeklyExecutionType;
  executedAt: string;
  executedWeekStart: string;
  executedWeekEnd: string;
  totalAutomated: number;
  passed: number;
  failed: number;
  passRate: number;
  testCases: number;
  applicationCoverage?: number | null;
  automationScripts: number;
  coveragePercent: number;
  resultsLink?: string;
  queueId?: number;
  queueUrl?: string;
  buildUrl?: string;
  buildNumber?: number;
  runPrefix?: string;
  status: WeeklyJobStatus;
  errorMessage?: string;
};

type WeeklyBoardRow = {
  id: string;
  sn: number;
  platform: string;
  suite: string;
  testCases: number;
  applicationCoverage?: number | null;
  automationScripts: number;
  coveragePercent: number;
  execution: WeeklyExecutionType | '—';
  passed: number;
  failed: number;
  passingRate: number;
  executedWeek: string;
  resultsLink?: string;
  jobStatus: string;
  label: string;
  executedAt?: string;
};

type WeeklyStatusSummary = {
  totalAutomated: number;
  passed: number;
  failed: number;
  passRate: number;
};

function loadEnvHealth(): EnvRun[] {
  ensureEnvHealthFile();
  try {
    return JSON.parse(fs.readFileSync(envHealthFile, 'utf8'));
  } catch {
    return [];
  }
}

function saveEnvHealth(runs: EnvRun[]) {
  ensureEnvHealthFile();
  fs.writeFileSync(envHealthFile, JSON.stringify(runs, null, 2), 'utf8');
}

function mapStoredResultRunRow(row: any, includeData = false): StoredResultRun {
  let data: any = undefined;
  if (includeData) {
    try {
      data = row.data ? JSON.parse(row.data) : [];
    } catch {
      data = [];
    }
  }

  return {
    id: row.id,
    name: row.name,
    key: row.key,
    resultUrl: row.resultUrl,
    data,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    passed: row.passed,
    failed: row.failed,
    skipped: row.skipped,
    total: row.total,
    hasResultHtml: !!row.hasResultHtml,
    hasReportZip: !!row.hasReportZip
  };
}

function loadResultRuns(includeData = false): StoredResultRun[] {
  try {
    const dataColumn = includeData ? ', data' : '';
    const rows = db
      .prepare(
        `SELECT id, name, key, resultUrl${dataColumn}, createdAt, expiresAt, passed, failed, skipped, total,
                (resultHtml IS NOT NULL AND length(resultHtml) > 0) as hasResultHtml,
                (reportZip IS NOT NULL AND length(reportZip) > 0) as hasReportZip
         FROM test_runs
         ORDER BY datetime(createdAt) DESC`
      )
      .all() as any[];
    if (rows.length) {
      return rows.map(row => mapStoredResultRunRow(row, includeData));
    }
  } catch (err) {
    console.warn('Failed to read test_runs from DB, falling back to file', err);
  }

  // Legacy file fallback (and migrate into DB)
  ensureResultRunsFile();
  try {
    const raw = fs.readFileSync(resultRunsFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      saveResultRuns(parsed);
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

function findStoredResultRunByKeys(keys: string[], includeData = false): StoredResultRun | undefined {
  const uniqueKeys = Array.from(new Set((keys || []).map(key => String(key || '').trim()).filter(Boolean)));
  if (!uniqueKeys.length) return undefined;

  try {
    const placeholders = uniqueKeys.map(() => '?').join(', ');
    const dataColumn = includeData ? ', data' : '';
    const rows = db
      .prepare(
        `SELECT id, name, key, resultUrl${dataColumn}, createdAt, expiresAt, passed, failed, skipped, total,
                (resultHtml IS NOT NULL AND length(resultHtml) > 0) as hasResultHtml,
                (reportZip IS NOT NULL AND length(reportZip) > 0) as hasReportZip
         FROM test_runs
         WHERE key IN (${placeholders})`
      )
      .all(...uniqueKeys) as any[];

    if (!rows.length) return undefined;

    const byKey = new Map<string, StoredResultRun>();
    for (const row of rows) {
      const mapped = mapStoredResultRunRow(row, includeData);
      if (!mapped.key) continue;
      if (mapped.expiresAt && Date.parse(mapped.expiresAt) <= Date.now()) continue;
      byKey.set(mapped.key, mapped);
    }

    for (const key of uniqueKeys) {
      const found = byKey.get(key);
      if (found) return found;
    }
  } catch (err) {
    console.warn('Failed DB lookup for test_runs keys', err);
  }

  return undefined;
}

function resolveStoredResultUrl(run: Pick<StoredResultRun, 'key' | 'resultUrl' | 'hasResultHtml'> | null | undefined): string | undefined {
  if (!run) return undefined;
  if (run.hasResultHtml && run.key) {
    return `/api/results/result-html?key=${encodeURIComponent(run.key)}`;
  }
  return run.resultUrl || undefined;
}

function countStatuses(data: any[]): { passed: number; failed: number; skipped: number; total: number } {
  const leaf: any[] = [];
  const walk = (nodes: any[]) => {
    for (const n of nodes || []) {
      if (Array.isArray(n?.children) && n.children.length) {
        walk(n.children);
      } else {
        leaf.push(n);
      }
    }
  };
  walk(data || []);
  const total = leaf.length;
  const passed = leaf.filter(t => t?.status === 'PASS').length;
  const failed = leaf.filter(t => t?.status === 'FAIL').length;
  const skipped = leaf.filter(t => t?.status === 'SKIP').length;
  return { passed, failed, skipped, total };
}

function computeExpiresAt(createdAtIso: string, days = 30): string {
  const createdAtMs = Date.parse(createdAtIso);
  const base = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();
  return new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
}

function upsertResultRunToDb(run: StoredResultRun) {
  const hasData = run.data !== undefined;
  const data = hasData ? (Array.isArray(run.data) ? run.data : []) : null;
  let counts = hasData ? countStatuses(data as any[]) : null;
  if (counts && counts.total === 0) {
    counts = null;
  }
  if (!counts && (run.passed !== undefined || run.failed !== undefined || run.skipped !== undefined || run.total !== undefined)) {
    const passed = run.passed ?? 0;
    const failed = run.failed ?? 0;
    const skipped = run.skipped ?? 0;
    const total = run.total ?? Math.max(0, passed + failed + skipped);
    counts = { passed, failed, skipped, total };
  }
  const expiresAt = run.expiresAt || computeExpiresAt(run.createdAt, 30);
  db.prepare(
    `INSERT INTO test_runs (id, name, key, resultUrl, data, resultHtml, reportZip, createdAt, expiresAt, passed, failed, skipped, total)
     VALUES (
       @id,
       @name,
       @key,
       @resultUrl,
       COALESCE(@data, '[]'),
       @resultHtml,
       @reportZip,
       @createdAt,
       @expiresAt,
       COALESCE(@passed, 0),
       COALESCE(@failed, 0),
       COALESCE(@skipped, 0),
       COALESCE(@total, 0)
     )
     ON CONFLICT(id) DO UPDATE SET
       name = @name,
       key = @key,
       resultUrl = COALESCE(@resultUrl, test_runs.resultUrl),
       data = CASE WHEN @data IS NULL THEN test_runs.data ELSE @data END,
       resultHtml = COALESCE(@resultHtml, test_runs.resultHtml),
       reportZip = COALESCE(@reportZip, test_runs.reportZip),
       expiresAt = @expiresAt,
       passed = CASE WHEN @passed IS NULL THEN test_runs.passed ELSE @passed END,
       failed = CASE WHEN @failed IS NULL THEN test_runs.failed ELSE @failed END,
       skipped = CASE WHEN @skipped IS NULL THEN test_runs.skipped ELSE @skipped END,
       total = CASE WHEN @total IS NULL THEN test_runs.total ELSE @total END`
  ).run({
    id: run.id,
    name: run.name,
    key: run.key,
    resultUrl: run.resultUrl,
    data: data ? JSON.stringify(data) : null,
    resultHtml: run.resultHtml ?? null,
    reportZip: run.reportZip ?? null,
    createdAt: run.createdAt,
    expiresAt,
      passed: counts?.passed ?? null,
      failed: counts?.failed ?? null,
      skipped: counts?.skipped ?? null,
      total: counts?.total ?? null
  });
}

function saveResultRuns(runs: StoredResultRun[]) {
  ensureResultRunsFile();
  // Keep legacy file for compatibility
  fs.writeFileSync(resultRunsFile, JSON.stringify(runs, null, 2), 'utf8');
  // Persist to DB
  for (const run of runs || []) {
    upsertResultRunToDb(run);
  }
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toNullableNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function computePassRate(passed: number, failed: number, fallback = 0): number {
  const total = Math.max(0, passed + failed);
  if (total === 0) return toFiniteNumber(fallback, 0);
  return Number(((passed / total) * 100).toFixed(2));
}

const DEFAULT_RESULT_INGEST_TIMEOUT_MS = Math.max(1000, Number(process.env.RESULT_INGEST_TIMEOUT_MS || 8000));

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_RESULT_INGEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function deriveResultHtmlKeyFromRunKey(key: string): string {
  const normalized = String(key || '').trim();
  if (!normalized) return normalized;
  if (/result\.html$/i.test(normalized)) return normalized;
  if (/(test|cucumber)\.json(\.gz|\.zip)?$/i.test(normalized)) {
    return normalized.replace(/(test|cucumber)\.json(\.gz|\.zip)?$/i, 'result.html');
  }
  return normalized.replace(/\/+$/, '') + '/result.html';
}

function deriveStoredResultUrl(key: string, providedResultUrl?: string, existingResultUrl?: string): string | undefined {
  if (providedResultUrl) return providedResultUrl;
  if (existingResultUrl) return existingResultUrl;
  const htmlKey = deriveResultHtmlKeyFromRunKey(key);
  return presignS3GetUrl(htmlKey) || s3UrlForKey(htmlKey);
}

async function hydrateStoredResultHtml(input: {
  id: string;
  key: string;
  name: string;
  createdAt: string;
  resultUrl?: string;
  existingResultHtml?: boolean;
}): Promise<boolean> {
  if (!input.resultUrl || input.existingResultHtml) {
    return false;
  }

  try {
    const resp = await fetchWithTimeout(
      input.resultUrl,
      {
        headers: {
          Accept: 'text/html,application/xhtml+xml'
        }
      },
      DEFAULT_RESULT_INGEST_TIMEOUT_MS
    );
    if (!resp.ok) {
      return false;
    }

    const html = await resp.text();
    if (!html || !html.trim()) {
      return false;
    }

    upsertResultRunToDb({
      id: input.id,
      key: input.key,
      name: input.name,
      createdAt: input.createdAt,
      resultUrl: input.resultUrl,
      resultHtml: html
    });

    return true;
  } catch {
    return false;
  }
}

function mapWeeklyExecutionRow(row: any): StoredWeeklyExecution {
  return {
    id: String(row.id),
    boardId: String(row.boardId),
    jobId: row.jobId ? String(row.jobId) : undefined,
    label: String(row.label),
    platform: String(row.platform) as WeeklyPlatform,
    suite: String(row.suite) as WeeklySuite,
    tag: row.tag ? String(row.tag) : undefined,
    environment: row.environment ? String(row.environment) : undefined,
    browser: row.browser ? String(row.browser) : undefined,
    deviceType: row.deviceType ? String(row.deviceType) : undefined,
    executionType: String(row.executionType) as WeeklyExecutionType,
    executedAt: String(row.executedAt),
    executedWeekStart: String(row.executedWeekStart),
    executedWeekEnd: String(row.executedWeekEnd),
    totalAutomated: toFiniteNumber(row.totalAutomated),
    passed: toFiniteNumber(row.passed),
    failed: toFiniteNumber(row.failed),
    passRate: toFiniteNumber(row.passRate),
    testCases: toFiniteNumber(row.testCases),
    applicationCoverage: row.applicationCoverage === null || row.applicationCoverage === undefined ? null : toFiniteNumber(row.applicationCoverage),
    automationScripts: toFiniteNumber(row.automationScripts),
    coveragePercent: toFiniteNumber(row.coveragePercent),
    resultsLink: row.resultsLink ? String(row.resultsLink) : undefined,
    queueId: row.queueId === null || row.queueId === undefined ? undefined : toFiniteNumber(row.queueId),
    queueUrl: row.queueUrl ? String(row.queueUrl) : undefined,
    buildUrl: row.buildUrl ? String(row.buildUrl) : undefined,
    buildNumber: row.buildNumber === null || row.buildNumber === undefined ? undefined : toFiniteNumber(row.buildNumber),
    runPrefix: row.runPrefix ? String(row.runPrefix) : undefined,
    status: String(row.status || 'NOT_RUN') as WeeklyJobStatus,
    errorMessage: row.errorMessage ? String(row.errorMessage) : undefined
  };
}

function getWeeklyExecution(id: string): StoredWeeklyExecution | undefined {
  const row = db.prepare('SELECT * FROM weekly_automation_executions WHERE id = ?').get(id) as any;
  return row ? mapWeeklyExecutionRow(row) : undefined;
}

function listWeeklyExecutions(weekStart: string, weekEnd: string): StoredWeeklyExecution[] {
  const rows = db
    .prepare(
      `SELECT *
       FROM weekly_automation_executions
       WHERE executedWeekStart = ? AND executedWeekEnd = ?
       ORDER BY datetime(executedAt) DESC, rowid DESC`
    )
    .all(weekStart, weekEnd) as any[];
  return rows.map(mapWeeklyExecutionRow);
}

function upsertWeeklyExecutionToDb(run: StoredWeeklyExecution): StoredWeeklyExecution {
  const boardDef =
    findWeeklyBoardDefinitionById(run.boardId) ||
    findWeeklyBoardDefinitionById(findWeeklyJobDefinitionById(run.jobId)?.boardId) ||
    findWeeklyBoardDefinitionByTag(run.tag, run.deviceType);
  if (!boardDef) {
    throw new Error(`Unable to resolve weekly board definition for ${run.boardId || run.tag || run.id}`);
  }

  const normalized: StoredWeeklyExecution = {
    ...run,
    boardId: boardDef.id,
    label: run.label || boardDef.suiteLabel,
    platform: boardDef.platform,
    suite: boardDef.suite,
    testCases: toFiniteNumber(run.testCases, boardDef.testCases),
    applicationCoverage:
      run.applicationCoverage === null || run.applicationCoverage === undefined
        ? boardDef.applicationCoverage ?? null
        : toFiniteNumber(run.applicationCoverage),
    automationScripts: toFiniteNumber(run.automationScripts, boardDef.automationScripts),
    coveragePercent: toFiniteNumber(run.coveragePercent, boardDef.coveragePercent),
    totalAutomated: toFiniteNumber(run.totalAutomated, run.automationScripts || boardDef.automationScripts),
    passed: toFiniteNumber(run.passed),
    failed: toFiniteNumber(run.failed),
    passRate: computePassRate(toFiniteNumber(run.passed), toFiniteNumber(run.failed), run.passRate),
    status: run.status || 'NOT_RUN'
  };

  db.prepare(
    `INSERT INTO weekly_automation_executions (
       id, boardId, jobId, label, platform, suite, tag, environment, browser, deviceType,
       executionType, executedAt, executedWeekStart, executedWeekEnd, totalAutomated, passed,
       failed, passRate, testCases, applicationCoverage, automationScripts, coveragePercent,
       resultsLink, queueId, queueUrl, buildUrl, buildNumber, runPrefix, status, errorMessage
     ) VALUES (
       @id, @boardId, @jobId, @label, @platform, @suite, @tag, @environment, @browser, @deviceType,
       @executionType, @executedAt, @executedWeekStart, @executedWeekEnd, @totalAutomated, @passed,
       @failed, @passRate, @testCases, @applicationCoverage, @automationScripts, @coveragePercent,
       @resultsLink, @queueId, @queueUrl, @buildUrl, @buildNumber, @runPrefix, @status, @errorMessage
     )
     ON CONFLICT(id) DO UPDATE SET
       boardId = @boardId,
       jobId = @jobId,
       label = @label,
       platform = @platform,
       suite = @suite,
       tag = @tag,
       environment = @environment,
       browser = @browser,
       deviceType = @deviceType,
       executionType = @executionType,
       executedAt = @executedAt,
       executedWeekStart = @executedWeekStart,
       executedWeekEnd = @executedWeekEnd,
       totalAutomated = @totalAutomated,
       passed = @passed,
       failed = @failed,
       passRate = @passRate,
       testCases = @testCases,
       applicationCoverage = @applicationCoverage,
       automationScripts = @automationScripts,
       coveragePercent = @coveragePercent,
       resultsLink = @resultsLink,
       queueId = @queueId,
       queueUrl = @queueUrl,
       buildUrl = @buildUrl,
       buildNumber = @buildNumber,
       runPrefix = @runPrefix,
       status = @status,
       errorMessage = @errorMessage`
  ).run({
    ...normalized,
    applicationCoverage: normalized.applicationCoverage ?? null,
    resultsLink: normalized.resultsLink ?? null,
    queueId: normalized.queueId ?? null,
    queueUrl: normalized.queueUrl ?? null,
    buildUrl: normalized.buildUrl ?? null,
    buildNumber: normalized.buildNumber ?? null,
    runPrefix: normalized.runPrefix ?? null,
    errorMessage: normalized.errorMessage ?? null
  });

  return getWeeklyExecution(normalized.id) || normalized;
}

function saveWeeklyExecutionPatch(id: string, patch: Partial<StoredWeeklyExecution>): StoredWeeklyExecution | undefined {
  const current = getWeeklyExecution(id);
  if (!current) return undefined;
  return upsertWeeklyExecutionToDb({ ...current, ...patch, id });
}

function buildWeeklyExecutionSeed(input: {
  id?: string;
  boardId?: string;
  jobId?: string;
  label?: string;
  tag?: string;
  environment?: string;
  browser?: string;
  deviceType?: string;
  executionType: WeeklyExecutionType;
  status: WeeklyJobStatus;
  executedAt?: string;
  executedWeekStart: string;
  executedWeekEnd: string;
}): StoredWeeklyExecution {
  const boardDef =
    findWeeklyBoardDefinitionById(input.boardId) ||
    findWeeklyBoardDefinitionById(findWeeklyJobDefinitionById(input.jobId)?.boardId) ||
    findWeeklyBoardDefinitionByTag(input.tag, input.deviceType);
  if (!boardDef) {
    throw new Error('Unable to determine weekly status board row for the requested execution.');
  }

  return {
    id: input.id || crypto.randomUUID(),
    boardId: boardDef.id,
    jobId: input.jobId,
    label: input.label || boardDef.suiteLabel,
    platform: boardDef.platform,
    suite: boardDef.suite,
    tag: input.tag,
    environment: input.environment,
    browser: input.browser,
    deviceType: input.deviceType,
    executionType: input.executionType,
    executedAt: input.executedAt || new Date().toISOString(),
    executedWeekStart: input.executedWeekStart,
    executedWeekEnd: input.executedWeekEnd,
    totalAutomated: boardDef.automationScripts,
    passed: 0,
    failed: 0,
    passRate: 0,
    testCases: boardDef.testCases,
    applicationCoverage: boardDef.applicationCoverage ?? null,
    automationScripts: boardDef.automationScripts,
    coveragePercent: boardDef.coveragePercent,
    resultsLink: undefined,
    queueId: undefined,
    queueUrl: undefined,
    buildUrl: undefined,
    buildNumber: undefined,
    runPrefix: undefined,
    status: input.status,
    errorMessage: undefined
  };
}

function buildWeeklyStatusResponse(
  weekStart: string,
  weekEnd: string,
  executions: StoredWeeklyExecution[],
  filters: { platform?: string; suite?: string; executionType?: string }
): { summary: WeeklyStatusSummary; rows: WeeklyBoardRow[] } {
  const normalizedPlatform = String(filters.platform || '').toUpperCase();
  const normalizedSuite = String(filters.suite || '').toUpperCase();
  const normalizedExecutionType = String(filters.executionType || '').toUpperCase();

  const filteredExecutions = executions.filter(execution => {
    if (normalizedPlatform && normalizedPlatform !== 'ALL' && execution.platform !== normalizedPlatform) return false;
    if (normalizedSuite && normalizedSuite !== 'ALL' && execution.suite !== normalizedSuite) return false;
    if (normalizedExecutionType && normalizedExecutionType !== 'ALL' && execution.executionType !== normalizedExecutionType) return false;
    return true;
  });

  const latestByBoardId = new Map<string, StoredWeeklyExecution>();
  for (const execution of filteredExecutions) {
    if (!latestByBoardId.has(execution.boardId)) {
      latestByBoardId.set(execution.boardId, execution);
    }
  }

  const rows = WEEKLY_STATUS_BOARD_DEFINITIONS
    .filter(def => {
      if (normalizedPlatform && normalizedPlatform !== 'ALL' && def.platform !== normalizedPlatform) return false;
      if (normalizedSuite && normalizedSuite !== 'ALL' && def.suite !== normalizedSuite) return false;
      if (normalizedExecutionType && normalizedExecutionType !== 'ALL' && !def.supportedExecutionTypes.includes(normalizedExecutionType as WeeklyExecutionType)) {
        return false;
      }
      return true;
    })
    .map<WeeklyBoardRow>(def => {
      const latest = latestByBoardId.get(def.id);
      return {
        id: def.id,
        sn: def.sn,
        platform: def.platformLabel,
        suite: def.suiteLabel,
        testCases: def.testCases,
        applicationCoverage: def.applicationCoverage ?? null,
        automationScripts: def.automationScripts,
        coveragePercent: def.coveragePercent,
        execution: latest?.executionType || (def.supportedExecutionTypes[0] || '—'),
        passed: latest?.passed ?? 0,
        failed: latest?.failed ?? 0,
        passingRate: latest?.passRate ?? 0,
        executedWeek: `${weekStart} to ${weekEnd}`,
        resultsLink: latest?.resultsLink,
        jobStatus: latest?.status || 'NOT_RUN',
        label: latest?.label || def.suiteLabel,
        executedAt: latest?.executedAt
      };
    });

  const summary = rows.reduce<WeeklyStatusSummary>(
    (acc, row) => {
      acc.totalAutomated += row.automationScripts;
      acc.passed += row.passed;
      acc.failed += row.failed;
      return acc;
    },
    { totalAutomated: 0, passed: 0, failed: 0, passRate: 0 }
  );
  summary.passRate = computePassRate(summary.passed, summary.failed, 0);

  return { summary, rows };
}

function s3UrlForKey(key: string) {
  const base = defaultS3Base;
  const cleaned = key.replace(/^\//, '');
  const encoded = cleaned.split('/').map(seg => encodeURIComponent(seg)).join('/');
  return `${base.replace(/\/$/, '')}/${encoded}`;
}

function hmac(key: Buffer, data: string) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256(data: string) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function getSignatureKey(key: string, dateStamp: string, region: string, service: string) {
  const kDate = hmac(Buffer.from('AWS4' + key, 'utf8'), dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  return kSigning;
}

function presignS3GetUrl(key: string, expiresSeconds = presignExpirySeconds): string | null {
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKey || !secretKey) return null;

  const cleanedKey = key.replace(/^\//, '');
  const host = defaultS3Base.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.substring(0, 8); // YYYYMMDD
  const service = 's3';
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${defaultRegion}/${service}/aws4_request`;

  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalUri = '/' + cleanedKey.split('/').map(seg => encodeURIComponent(seg)).join('/');
  const amzKey = (name: string) => `X-Amz-${name}`;
  const amzAlgorithmKey = amzKey('Algorithm');
  const amzCredentialKey = amzKey('Credential');
  const amzDateKey = amzKey('Date');
  const amzExpiresKey = amzKey('Expires');
  const amzSignedHeadersKey = amzKey('SignedHeaders');
  const amzSignatureKey = amzKey('Signature');

  const canonicalQuery = [
    `${amzAlgorithmKey}=${algorithm}`,
    `${amzCredentialKey}=${encodeURIComponent(accessKey + '/' + credentialScope)}`,
    `${amzDateKey}=${amzDate}`,
    `${amzExpiresKey}=${expiresSeconds}`,
    `${amzSignedHeadersKey}=${signedHeaders}`
  ].join('&');

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = ['GET', canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    sha256(canonicalRequest)
  ].join('\n');

  const signingKey = getSignatureKey(secretKey, dateStamp, defaultRegion, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  const signedUrl = `https://${host}${canonicalUri}?${canonicalQuery}&${amzSignatureKey}=${signature}`;
  return signedUrl;
}

function swapReportTargetInKey(key: string): string | null {
  if (key.includes('/desktop_web/')) return key.replace('/desktop_web/', '/mobile_web/');
  if (key.includes('/mobile_web/')) return key.replace('/mobile_web/', '/desktop_web/');
  return null;
}

function normalizeReportTargetValue(value: any): string | null {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const lowered = raw.toLowerCase().replace(/\s+/g, '_');
  if (/(mobile|mw)/.test(lowered)) return 'mobile_web';
  if (/(desktop|dw)/.test(lowered)) return 'desktop_web';
  return lowered;
}

function applyReportTargetToKey(key: string, target: string | null): string | null {
  if (!target) return null;
  if (!key.includes('/desktop_web/') && !key.includes('/mobile_web/')) return null;
  const normalized = normalizeReportTargetValue(target);
  if (!normalized) return null;
  return key.replace(/\/(desktop_web|mobile_web)\//, `/${normalized}/`);
}

function extractJobPathFromJobUrl(jobUrl?: string): string | null {
  if (!jobUrl) return null;
  try {
    const url = new URL(jobUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    const jobSegments: string[] = [];
    for (let i = 0; i < parts.length; i += 1) {
      if (parts[i] === 'job' && parts[i + 1]) {
        const seg = parts[i + 1];
        if (seg !== 'buildWithParameters' && seg !== 'build') {
          jobSegments.push(seg);
        }
      }
    }
    return jobSegments.length ? jobSegments.join('/') : null;
  } catch {
    return null;
  }
}

function applyJobPathToKey(key: string, jobPath: string | null): string | null {
  if (!jobPath) return null;
  const match = key.match(/^(\d{2}-\d{2}-\d{2})\/([^/]+)\/(.+?)\/(\d+)\/reports\/(.+)$/);
  if (!match) return null;
  const [, datePart, target, , buildNumber, tail] = match;
  return `${datePart}/${target}/${jobPath}/${buildNumber}/reports/${tail}`;
}

function expandDateVariants(key: string): string[] {
  const match = key.match(/^(\d{2})-(\d{2})-(\d{2})\//);
  if (!match) return [key];
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = 2000 + Number(match[3]);
  if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) return [key];
  const baseUtc = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(baseUtc)) return [key];
  const suffix = key.slice(match[0].length);
  const offsets = [0, 1, -1, 2, -2];
  const variants: string[] = [];
  for (const offset of offsets) {
    const d = new Date(baseUtc + offset * 24 * 60 * 60 * 1000);
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const yy = String(d.getUTCFullYear()).slice(-2);
    variants.push(`${mm}-${dd}-${yy}/${suffix}`);
  }
  return Array.from(new Set(variants));
}

function parseDateFromKey(key: string): number | null {
  const match = key.match(/^(\d{2})-(\d{2})-(\d{2})\//);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = 2000 + Number(match[3]);
  if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  return Date.UTC(year, month - 1, day);
}

function pickBestCandidate(candidates: string[], preferredTarget?: string | null): string | null {
  if (!candidates.length) return null;
  const normalizedTarget = normalizeReportTargetValue(preferredTarget);
  const scored = candidates.map(k => {
    const dateScore = parseDateFromKey(k) ?? 0;
    const targetScore = normalizedTarget && k.includes(`/${normalizedTarget}/`) ? 1 : 0;
    const htmlScore = /\/result\.html$/i.test(k) ? 1 : 0;
    return { key: k, dateScore, targetScore, htmlScore };
  });
  scored.sort((a, b) => {
    if (a.dateScore !== b.dateScore) return b.dateScore - a.dateScore;
    if (a.targetScore !== b.targetScore) return b.targetScore - a.targetScore;
    if (a.htmlScore !== b.htmlScore) return b.htmlScore - a.htmlScore;
    return 0;
  });
  return scored[0]?.key || null;
}

async function s3ObjectExists(key: string): Promise<boolean> {
  const url = presignS3GetUrl(key, 300) || s3UrlForKey(key);
  try {
    const resp = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
    return resp.ok || resp.status === 206 || resp.status === 416;
  } catch {
    return false;
  }
}

async function resolveS3Key(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (await s3ObjectExists(candidate)) return candidate;
  }
  return null;
}

function startOfWeekISO(date: Date) {
  const d = new Date(date);
  const day = d.getUTCDay() || 7;
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function scheduleEnvHealthAutoSync(port: number) {
  // Check every minute; run at 8:00, 12:00, 17:00 local time if not already run for that hour/day.
  setInterval(async () => {
    const now = new Date();
    const hour = now.getHours();
    const key = `${now.toDateString()}-${hour}`;
    // prune old keys
    if (envHealthRunKeys.size > 30) {
      const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
      for (const k of Array.from(envHealthRunKeys)) {
        const [dayStr] = k.split('-');
        const dt = new Date(dayStr).getTime();
        if (Number.isFinite(dt) && dt < cutoff) envHealthRunKeys.delete(k);
      }
    }
    if (!envHealthSyncHours.includes(hour) || envHealthRunKeys.has(key)) return;
    envHealthRunKeys.add(key);
    try {
      const resp = await fetch(`http://localhost:${port}/api/env-health/sync`, { method: 'POST' });
      if (!resp.ok) {
        const text = await resp.text();
        console.warn('[env-health auto-sync] non-200', resp.status, text?.slice(0, 500));
      } else {
        console.log('[env-health auto-sync] synced at hour', hour);
      }
    } catch (err) {
      console.warn('[env-health auto-sync] failed', err);
    }
  }, 60 * 1000);
}

function sampleEnvChecks(): EnvCheck[] {
  return [
    { name: 'Page Load Performance', status: 'WARNING', detail: 'Acceptable: 6.74s' },
    { name: 'HTTPS Security', status: 'PASS', detail: 'Secure HTTPS' },
    { name: 'Page Size Check', status: 'PASS', detail: 'Optimal: 1.00MB' },
    { name: 'JavaScript Errors', status: 'WARNING', detail: '9 errors' },
    { name: 'Mobile 320px', status: 'PASS', detail: 'Mobile responsive' },
    { name: 'Mobile 375px', status: 'PASS', detail: 'iPhone responsive' },
    { name: 'Tablet Viewport', status: 'PASS', detail: 'Tablet responsive' },
    { name: 'Image Loading', status: 'PASS', detail: 'All images OK' },
    { name: 'Modern Image Formats', status: 'WARNING', detail: 'Limited WebP' },
    { name: 'Video Player', status: 'PASS', detail: 'Video present' },
    { name: 'Weather Section', status: 'PASS', detail: 'Weather link found' },
    { name: 'Weather Widget', status: 'PASS', detail: 'Widget present' },
    { name: 'Advertisement Units', status: 'PASS', detail: '4 ad(s)' },
    { name: 'Sidebar Ads', status: 'PASS', detail: '1 sidebar ad(s)' },
    { name: 'Login/Sign-up', status: 'WARNING', detail: 'No login' },
    { name: 'Analytics', status: 'PASS', detail: 'Analytics present' },
    { name: 'Sports Section', status: 'PASS', detail: 'Sports found' },
    { name: 'Search', status: 'PASS', detail: 'Search present' },
    { name: 'Social Media', status: 'PASS', detail: '4 social links' },
    { name: 'Footer', status: 'PASS', detail: 'Footer present' },
    { name: 'Scroll', status: 'PASS', detail: 'Scroll works' },
    { name: 'Navigation', status: 'PASS', detail: '21 nav links' },
    { name: 'Broken Links', status: 'PASS', detail: 'Links checked' },
    { name: 'Article Links', status: 'PASS', detail: '138 article links' },
    { name: 'Breaking News', status: 'WARNING', detail: 'No breaking news' },
    { name: 'Local Sections', status: 'PASS', detail: '11 local sections' },
    { name: 'Accessibility', status: 'PASS', detail: '24 accessibility attrs' },
    { name: 'Meta Tags', status: 'PASS', detail: '3/3 meta tags' },
    { name: 'Live Updates', status: 'PASS', detail: 'Live section found' },
    { name: 'Newsletter', status: 'WARNING', detail: 'No newsletter' }
  ];
}

app.get('/api/test-runs', (_req, res) => {
  const runs = loadRuns().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(runs);
});

app.post('/api/test-runs', (req, res) => {
  const { name, passed = 0, failed = 0, skipped = 0, total = 0 } = req.body as Partial<StoredRun>;
  if (!name) return res.status(400).json({ message: 'name is required' });
  const runs = loadRuns();
  const id = `${Date.now()}`;
  const createdAt = new Date().toISOString();
  const run: StoredRun = { id, name, passed, failed, skipped, total, createdAt };
  runs.push(run);
  saveRuns(runs);
  res.status(201).json(run);
});

// Environment health history
app.get('/api/env-health', (_req, res) => {
  const runs = loadEnvHealth().sort((a, b) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime());
  res.json(runs);
});

app.post('/api/env-health/sync', async (_req, res) => {
  const sourceUrl = process.env.ENV_HEALTH_URL || 'https://jenkins.otsops.com/job/NBC-Multi-Site-Testing/NBC_20Test_20Report/';
  const now = new Date();
  const weekOf = startOfWeekISO(now);
  const id = `${now.getTime()}`;

  let checks: EnvCheck[] = [];
  try {
    const response = await fetch(sourceUrl, { headers: { Accept: 'text/html' } });
    if (response.ok) {
      const text = await response.text();
      // best-effort parse: look for lines like "Name\tSTATUS\tDetail"
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const parsed: EnvCheck[] = [];
      for (const line of lines) {
        const parts = line.split(/\s{2,}|\t/);
        if (parts.length >= 2 && ['PASS', 'FAIL', 'WARNING'].includes(parts[1].toUpperCase())) {
          parsed.push({ name: parts[0], status: parts[1].toUpperCase(), detail: parts.slice(2).join(' ') });
        }
      }
      checks = parsed.length ? parsed : sampleEnvChecks();
    } else {
      checks = sampleEnvChecks();
    }
  } catch {
    checks = sampleEnvChecks();
  }

  const run: EnvRun = {
    id,
    site: 'NBC Multi-Site',
    fetchedAt: now.toISOString(),
    weekOf,
    sourceUrl,
    checks
  };

  const all = loadEnvHealth();
  all.push(run);
  saveEnvHealth(all);
  res.status(201).json(run);
});

// --- Test result fetch from S3/public URL ---
app.post('/api/results/fetch-json', async (req, res) => {
  const { key } = req.body as { key?: string };
  if (!key) return res.status(400).json({ message: 'key is required (e.g. 11-24-25:B/test.json)' });
  const baseKey = key.replace(/(\.zip|\.gz)$/i, '');
  const swappedBase = swapReportTargetInKey(baseKey);
  const baseKeys = [baseKey, ...(swappedBase ? [swappedBase] : [])];
  const jobPath = extractJobPathFromJobUrl(process.env.JENKINS_JOB_URL);
  const jobPathKeys = Array.from(new Set(baseKeys.map(k => applyJobPathToKey(k, jobPath)).filter(Boolean))) as string[];
  const expandedBaseKeys = Array.from(
    new Set([...baseKeys, ...jobPathKeys].flatMap(k => expandDateVariants(k)))
  );

  const expandKey = (k: string): string[] => {
    const variants = [k];
    if (!k.endsWith('.zip')) variants.push(`${k}.zip`);
    if (!k.endsWith('.gz')) variants.push(`${k}.gz`);
    return variants;
  };

  const altJsonKeys = (k: string): string[] => {
    if (/test\.json$/i.test(k)) {
      return [k.replace(/test\.json$/i, 'cucumber.json')];
    }
    return [];
  };

  const candidateKeys = Array.from(
    new Set(
      expandedBaseKeys.flatMap(k => [
        ...expandKey(k),
        ...altJsonKeys(k).flatMap(alt => expandKey(alt))
      ])
    )
  );

  const cachedRun = findStoredResultRunByKeys(candidateKeys, true);
  if (cachedRun) {
    const cachedData = Array.isArray(cachedRun.data) ? cachedRun.data : [];
    const cachedSummary =
      cachedRun.total || cachedRun.passed || cachedRun.failed || cachedRun.skipped
        ? {
            total: Number(cachedRun.total || 0),
            passed: Number(cachedRun.passed || 0),
            failed: Number(cachedRun.failed || 0),
            skipped: Number(cachedRun.skipped || 0)
          }
        : cachedData.length
          ? countStatuses(cachedData)
          : undefined;

    if (cachedData.length || cachedSummary) {
      if (cachedData.length) {
        ensureLatestTestFile();
        fs.writeFileSync(latestTestFile, JSON.stringify(cachedData, null, 2), 'utf8');
      }

      return res.json({
        key: cachedRun.key || baseKey,
        saved: true,
        data: cachedData,
        resultUrl: resolveStoredResultUrl(cachedRun),
        runId: cachedRun.id,
        summary: cachedSummary,
        note: cachedData.length ? 'db-cache' : 'db-summary'
      });
    }
  }

  const prefixes = Array.from(
    new Set(
      expandedBaseKeys.map(k =>
        k.replace(/\/?(test|cucumber)\.json(\.gz|\.zip)?$/i, '')
      )
    )
  );
  const xmlCandidates = Array.from(
    new Set(
      prefixes
        .flatMap(prefix => [
          `${prefix}/cucumber-junit.xml`,
          `${prefix}/testng-results.xml`,
          `${prefix}/TEST-TestSuite.xml`,
          `${prefix}/test-output/testng-results.xml`,
          `${prefix}/test-output/TEST-TestSuite.xml`,
          `${prefix}/junitreports/TEST-TestSuite.xml`,
          `${prefix}/test-output/junitreports/TEST-nbc_WP.cucumberOptions.TestRunner.xml`,
          `${prefix}/junitreports/TEST-nbc_WP.cucumberOptions.TestRunner.xml`
        ])
        .flatMap(p => expandDateVariants(p))
    )
  );


  const attempts: any[] = [];
  let parsed: { data: any[]; raw: any; note?: string; usedKey: string; url: string } | null = null;

  for (const candidate of candidateKeys) {
    const target = presignS3GetUrl(candidate) || s3UrlForKey(candidate);
    try {
      const resp = await fetch(target);
      if (!resp.ok) {
        attempts.push({ key: candidate, url: target, status: resp.status, statusText: resp.statusText });
        continue;
      }
      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('json')) {
        const raw = await resp.json();
        parsed = { data: normalizeTestResults(raw), raw, usedKey: candidate, url: target };
        break;
      }
      const buffer = Buffer.from(await resp.arrayBuffer());
      const result = parseBufferAsJson(buffer);
      if (result?.data) {
        parsed = { data: result.data, raw: result.raw, note: result.note, usedKey: candidate, url: target };
        break;
      }
      attempts.push({ key: candidate, url: target, error: result?.error || 'Unknown parse error' });
    } catch (err: any) {
      attempts.push({ key: candidate, url: target, error: err?.message || String(err) });
    }
  }

  if (!parsed) {

    const xmlSummary = await fetchXmlSummary(xmlCandidates);
    if (!xmlSummary) {
      return res.status(502).json({
        message: 'Unable to fetch or parse test.json (tried json, gz, and zip variants).',
        attempts
      });
    }
    console.info(`[results] xml-summary used for ${baseKey} from ${xmlSummary.usedKey}`);

    const nowIso = new Date().toISOString();
    const prefix = xmlSummary.usedKey.replace(/\/[^/]+$/, '');
    const resultLink = presignS3GetUrl(`${prefix}/result.html`) || s3UrlForKey(`${prefix}/result.html`);
    const runs = loadResultRuns(true);
    const existingIdx = runs.findIndex(r => r.key === baseKey);
    const existingRun = existingIdx >= 0 ? runs[existingIdx] : undefined;
    const id = existingIdx >= 0 ? runs[existingIdx].id : `${Date.now()}`;
    const createdAt = existingIdx >= 0 ? runs[existingIdx].createdAt : nowIso;
    const entry: StoredResultRun = {
      id,
      name: existingRun?.name || baseKey,
      key: baseKey,
      resultUrl: resultLink,
      data: [],
      createdAt,
      passed: xmlSummary.summary.passed,
      failed: xmlSummary.summary.failed,
      skipped: xmlSummary.summary.skipped,
      total: xmlSummary.summary.total
    };
    if (existingIdx >= 0) {
      runs[existingIdx] = entry;
    } else {
      runs.push(entry);
    }
    saveResultRuns(runs);
    await hydrateStoredResultHtml({
      id,
      key: baseKey,
      name: entry.name,
      createdAt,
      resultUrl: resultLink,
      existingResultHtml: Boolean(existingRun?.hasResultHtml)
    });

    return res.json({
      key: baseKey,
      url: xmlSummary.url,
      saved: true,
      data: [],
      resultUrl: resultLink,
      runId: id,
      summary: xmlSummary.summary,
      note: 'xml-summary'
    });
  }

  let summary: { total: number; passed: number; failed: number; skipped: number } | null = null;
  let summarySource: string | null = null;
  const statusCounts = countStatuses(Array.isArray(parsed.data) ? parsed.data : []);
  if (statusCounts.total > 0) {
    summary = statusCounts;
    summarySource = 'data';
  } else {
    const xmlSummary = await fetchXmlSummary(xmlCandidates);
    if (xmlSummary) {
      summary = xmlSummary.summary;
      summarySource = `xml:${xmlSummary.usedKey}`;
      console.info(`[results] xml-summary used for ${parsed.usedKey} from ${xmlSummary.usedKey}`);
    }
  }


  ensureLatestTestFile();
  fs.writeFileSync(latestTestFile, JSON.stringify(parsed.data ?? parsed.raw ?? [], null, 2), 'utf8');

  // Save as a result run entry with inferred result.html link if possible
  const prefix = parsed.usedKey.replace(/\/?test\.json(\.zip|\.gz)?$/i, '');
  const resultLink = presignS3GetUrl(`${prefix}/result.html`) || s3UrlForKey(`${prefix}/result.html`);
  const runs = loadResultRuns(true);
  const existingIdx = runs.findIndex(r => r.key === parsed.usedKey);
  const existingRun = existingIdx >= 0 ? runs[existingIdx] : undefined;
  const nowIso = new Date().toISOString();
  const id = existingIdx >= 0 ? runs[existingIdx].id : `${Date.now()}`;
  const createdAt = existingIdx >= 0 ? runs[existingIdx].createdAt : nowIso;
  const entry: StoredResultRun = {
    id,
    name: existingRun?.name || parsed.usedKey,
    key: parsed.usedKey,
    resultUrl: resultLink,
    data: parsed.data,
    createdAt,
    passed: summary?.passed,
    failed: summary?.failed,
    skipped: summary?.skipped,
    total: summary?.total
  };
  if (existingIdx >= 0) {
    runs[existingIdx] = entry;
  } else {
    runs.push(entry);
  }
  saveResultRuns(runs);
  await hydrateStoredResultHtml({
    id,
    key: parsed.usedKey,
    name: entry.name,
    createdAt,
    resultUrl: resultLink,
    existingResultHtml: Boolean(existingRun?.hasResultHtml)
  });

  res.json({
    key: parsed.usedKey,
    url: parsed.url,
    saved: true,
    data: parsed.data,
    resultUrl: resultLink,
    runId: id,
    note: parsed.note,
    attempts,
    summary,
    summarySource
  });
});

// Accept an uploaded test.json payload (from Jenkins) and cache/update run
app.post('/api/results/upload-json', async (req, res) => {
  const body = req.body as { data?: any; raw?: any; key?: string; resultUrl?: string; name?: string };
  const incoming = body?.data ?? body?.raw;
  if (!incoming) return res.status(400).json({ message: 'data is required' });

  let parsed: any;
  try {
    parsed = typeof incoming === 'string' ? JSON.parse(incoming) : incoming;
  } catch (err: any) {
    return res.status(400).json({ message: `Invalid JSON payload: ${err?.message || err}` });
  }

  const data = normalizeTestResults(parsed);
  ensureLatestTestFile();
  fs.writeFileSync(latestTestFile, JSON.stringify(data, null, 2), 'utf8');

  const usedKey = body.key || 'uploaded/test.json';
  const runs = loadResultRuns(true);
  const existingIdx = runs.findIndex(r => r.key === usedKey);
  const existingRun = existingIdx >= 0 ? runs[existingIdx] : undefined;
  const nowIso = new Date().toISOString();
  const id = existingRun?.id || `${Date.now()}`;
  const createdAt = existingRun?.createdAt || nowIso;
  const resultLink = deriveStoredResultUrl(usedKey, body.resultUrl, existingRun?.resultUrl);
  const entry: StoredResultRun = {
    id,
    name: body.name || existingRun?.name || usedKey,
    key: usedKey,
    resultUrl: resultLink,
    data,
    createdAt
  };
  if (existingIdx >= 0) {
    runs[existingIdx] = entry;
  } else {
    runs.push(entry);
  }
  saveResultRuns(runs);
  await hydrateStoredResultHtml({
    id,
    key: usedKey,
    name: entry.name,
    createdAt,
    resultUrl: resultLink,
    existingResultHtml: Boolean(existingRun?.hasResultHtml)
  });

  res.status(201).json({
    saved: true,
    key: usedKey,
    resultUrl: resultLink,
    runId: id,
    count: Array.isArray(data) ? data.length : 0
  });
});

// Upload the raw test.json file (supports plain JSON, .gz, or .zip) and cache/update run.
// Usage (Jenkins): curl -s -X POST "http://localhost:3000/api/results/upload-file?key=.../test.json" \
//   -H "Content-Type: application/octet-stream" --data-binary @"${REPORT_DIR}/test.json.gz"
app.post(
  '/api/results/upload-file',
  express.raw({ type: ['application/octet-stream', 'application/gzip', 'application/x-gzip', 'application/zip'], limit: apiBodyLimit }),
  async (req, res) => {
    const key = (req.query.key as string) || (req.header('x-run-key') as string) || '';
    const name = (req.query.name as string) || (req.header('x-run-name') as string) || undefined;
    const resultUrl = (req.query.resultUrl as string) || (req.header('x-result-url') as string) || undefined;
    if (!key) return res.status(400).json({ message: 'key query param is required (e.g. 12-16-25/.../reports/test.json)' });

    const buffer = req.body as Buffer;
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(400).json({ message: 'Request body must be the test.json file contents.' });
    }

    const parsed = parseBufferAsJson(buffer);
    if (!parsed?.data) {
      return res.status(400).json({ message: parsed?.error || 'Unable to parse uploaded file as JSON.' });
    }

    const data = parsed.data;
    ensureLatestTestFile();
    fs.writeFileSync(latestTestFile, JSON.stringify(data ?? [], null, 2), 'utf8');

    const usedKey = key;
    const existing = db
      .prepare(
        `SELECT id, createdAt, name, resultUrl,
                (resultHtml IS NOT NULL AND length(resultHtml) > 0) as hasResultHtml
         FROM test_runs WHERE key = ?`
      )
      .get(usedKey) as
      | { id: string; createdAt: string; name: string; resultUrl?: string; hasResultHtml?: number }
      | undefined;
    const id = existing?.id || `${Date.now()}`;
    const createdAt = existing?.createdAt || new Date().toISOString();
    const resultLink = deriveStoredResultUrl(usedKey, resultUrl, existing?.resultUrl);

    upsertResultRunToDb({
      id,
      name: name || existing?.name || usedKey,
      key: usedKey,
      resultUrl: resultLink,
      data,
      createdAt
    });
    await hydrateStoredResultHtml({
      id,
      key: usedKey,
      name: name || existing?.name || usedKey,
      createdAt,
      resultUrl: resultLink,
      existingResultHtml: Boolean(existing?.hasResultHtml)
    });

    res.status(201).json({
      saved: true,
      key: usedKey,
      runId: id,
      resultUrl: resultLink,
      note: parsed.note,
      count: Array.isArray(data) ? data.length : 0
    });
  }
);

// Upload a zipped report folder for archival (kept in DB for ~30 days by expiresAt).
// This does NOT parse/extract; it stores the zip blob so result.html/test.json are always retrievable.
app.post(
  '/api/results/upload-report-zip',
  express.raw({ type: ['application/zip', 'application/octet-stream'], limit: apiBodyLimit }),
  async (req, res) => {
    const key = (req.query.key as string) || (req.header('x-run-key') as string) || '';
    const name = (req.query.name as string) || (req.header('x-run-name') as string) || undefined;
    const resultUrl = (req.query.resultUrl as string) || (req.header('x-result-url') as string) || undefined;
    if (!key) return res.status(400).json({ message: 'key query param is required (e.g. 12-16-25/.../reports/report.zip)' });

    const buffer = req.body as Buffer;
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(400).json({ message: 'Request body must be the report zip contents.' });
    }

    const existing = db
      .prepare(
        `SELECT id, createdAt, name, key, resultUrl,
                (resultHtml IS NOT NULL AND length(resultHtml) > 0) as hasResultHtml
         FROM test_runs WHERE key = ?`
      )
      .get(key) as
      | { id: string; createdAt: string; name: string; key: string; resultUrl?: string; hasResultHtml?: number }
      | undefined;
    const id = existing?.id || `${Date.now()}`;
    const createdAt = existing?.createdAt || new Date().toISOString();
    const resultLink = deriveStoredResultUrl(key, resultUrl, existing?.resultUrl);

    upsertResultRunToDb({
      id,
      name: name || existing?.name || key,
      key,
      resultUrl: resultLink,
      createdAt,
      reportZip: buffer
    });
    await hydrateStoredResultHtml({
      id,
      key,
      name: name || existing?.name || key,
      createdAt,
      resultUrl: resultLink,
      existingResultHtml: Boolean(existing?.hasResultHtml)
    });

    res.status(201).json({ saved: true, key, runId: id, size: buffer.length });
  }
);

app.get('/api/results/report-zip', (req, res) => {
  const key = (req.query.key as string) || '';
  if (!key) return res.status(400).json({ message: 'key query param is required' });
  const row = db.prepare('SELECT reportZip FROM test_runs WHERE key = ?').get(key) as { reportZip?: Buffer } | undefined;
  if (!row?.reportZip) return res.status(404).json({ message: 'No report zip stored for this key.' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'inline; filename="report.zip"');
  res.send(row.reportZip);
});

app.get('/api/results/run-status', (req, res) => {
  const key = (req.query.key as string) || '';
  if (!key) return res.status(400).json({ message: 'key query param is required' });
  const row = db
    .prepare(
      `SELECT id, key, name, createdAt, expiresAt,
              length(COALESCE(data, '')) AS dataChars,
              length(COALESCE(resultHtml, '')) AS resultHtmlChars,
              length(reportZip) AS reportZipBytes
       FROM test_runs
       WHERE key = ?`
    )
    .get(key) as
    | {
        id: string;
        key: string;
        name: string;
        createdAt: string;
        expiresAt?: string;
        dataChars: number;
        resultHtmlChars: number;
        reportZipBytes?: number;
      }
    | undefined;

  if (!row) {
    return res.json({ key, exists: false });
  }
  const hasTestJson = (row.dataChars ?? 0) > 2; // '[]' is 2 chars
  const hasResultHtml = (row.resultHtmlChars ?? 0) > 0;
  const hasReportZip = (row.reportZipBytes ?? 0) > 0;
  res.json({
    key,
    exists: true,
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    hasTestJson,
    dataChars: row.dataChars,
    hasResultHtml,
    resultHtmlChars: row.resultHtmlChars,
    hasReportZip,
    reportZipBytes: row.reportZipBytes ?? 0
  });
});

app.post(
  '/api/results/upload-result-html',
  express.raw({ type: ['text/html', 'application/octet-stream'], limit: apiBodyLimit }),
  (req, res) => {
    const key = (req.query.key as string) || (req.header('x-run-key') as string) || '';
    const name = (req.query.name as string) || (req.header('x-run-name') as string) || undefined;
    const resultUrl = (req.query.resultUrl as string) || (req.header('x-result-url') as string) || undefined;
    if (!key) return res.status(400).json({ message: 'key query param is required (use the same key as test.json for this run).' });

    const buffer = req.body as Buffer;
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(400).json({ message: 'Request body must be the result.html contents.' });
    }
    const html = buffer.toString('utf8');

    const existing = db.prepare('SELECT id, createdAt, name, resultUrl FROM test_runs WHERE key = ?').get(key) as
      | { id: string; createdAt: string; name: string; resultUrl?: string }
      | undefined;
    const id = existing?.id || `${Date.now()}`;
    const createdAt = existing?.createdAt || new Date().toISOString();
    const resultLink = deriveStoredResultUrl(key, resultUrl, existing?.resultUrl);

    upsertResultRunToDb({
      id,
      name: name || existing?.name || key,
      key,
      resultUrl: resultLink,
      createdAt,
      resultHtml: html
    });

    res.status(201).json({ saved: true, key, runId: id, size: buffer.length });
  }
);

app.get('/api/results/result-html', (req, res) => {
  const key = (req.query.key as string) || '';
  if (!key) return res.status(400).json({ message: 'key query param is required' });
  const row = db
    .prepare('SELECT resultHtml, expiresAt FROM test_runs WHERE key = ?')
    .get(key) as { resultHtml?: string; expiresAt?: string } | undefined;
  if (!row?.resultHtml) return res.status(404).json({ message: 'No result.html stored for this key.' });
  if (row.expiresAt && Date.parse(row.expiresAt) <= Date.now()) {
    return res.status(410).json({ message: 'This report has expired.' });
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(row.resultHtml);
});

app.get('/api/results/latest-json', (_req, res) => {
  ensureLatestTestFile();
  if (!fs.existsSync(latestTestFile)) return res.json({ message: 'No cached test.json yet' });
  try {
    const data = JSON.parse(fs.readFileSync(latestTestFile, 'utf8'));
    res.json(data);
  } catch {
    res.status(500).json({ message: 'Failed to read cached test.json' });
  }
});

app.get('/api/results/result-url', async (req, res) => {
  const key = req.query.key as string;
  if (!key) return res.status(400).json({ message: 'key is required (e.g. 11-24-25:B/result.html)' });

  const baseKey = /test\.json(\.gz|\.zip)?$/i.test(key) ? key.replace(/test\.json(\.gz|\.zip)?$/i, 'result.html') : key;
  const preferredTarget = normalizeReportTargetValue(process.env.JENKINS_REPORT_TARGET || process.env.REPORT_TARGET);
  const preferredKey = applyReportTargetToKey(baseKey, preferredTarget);
  const jobPath = extractJobPathFromJobUrl(process.env.JENKINS_JOB_URL);
  const jobPathKey = applyJobPathToKey(baseKey, jobPath);
  const jobPathPreferredKey = preferredKey ? applyJobPathToKey(preferredKey, jobPath) : null;
  const candidates: string[] = [];
  const seen = new Set<string>();
  const pushUnique = (k: string) => {
    if (!k || seen.has(k)) return;
    seen.add(k);
    candidates.push(k);
  };
  const addReportVariants = (k: string) => {
    for (const variant of expandDateVariants(k)) {
      pushUnique(variant);
      if (/\/result\.html$/i.test(variant)) {
        pushUnique(variant.replace(/\/result\.html$/i, '/test-output/index.html'));
        pushUnique(variant.replace(/\/result\.html$/i, '/emailable-report.html'));
      }
    }
  };

  if (jobPathPreferredKey && jobPathPreferredKey !== baseKey) addReportVariants(jobPathPreferredKey);
  if (jobPathKey && jobPathKey !== baseKey) addReportVariants(jobPathKey);
  if (preferredKey && preferredKey !== baseKey) addReportVariants(preferredKey);
  addReportVariants(baseKey);
  const swapped = swapReportTargetInKey(baseKey);
  if (swapped) addReportVariants(swapped);

  const dbKeys = Array.from(
    new Set(
      candidates.flatMap(candidate => {
        const keys = [candidate];
        if (/\/result\.html$/i.test(candidate)) {
          keys.push(candidate.replace(/\/result\.html$/i, '/test.json'));
        } else if (/\/test-output\/index\.html$/i.test(candidate)) {
          keys.push(candidate.replace(/\/test-output\/index\.html$/i, '/test.json'));
        } else if (/\/emailable-report\.html$/i.test(candidate)) {
          keys.push(candidate.replace(/\/emailable-report\.html$/i, '/test.json'));
        }
        return keys;
      })
    )
  );
  const cachedRun = findStoredResultRunByKeys(dbKeys, false);
  const cachedUrl = resolveStoredResultUrl(cachedRun);
  if (cachedRun && cachedUrl) {
    return res.json({ key, url: cachedUrl, resolvedKey: cachedRun.key || key, note: 'db-cache' });
  }

  const resolvedKey =
    (await resolveS3Key(candidates)) ||
    pickBestCandidate(candidates, preferredTarget) ||
    preferredKey ||
    swapped ||
    baseKey;
  const url = presignS3GetUrl(resolvedKey) || s3UrlForKey(resolvedKey);
  res.json({ key, url, resolvedKey });
});

// Result runs storage (full test.json with result link)
app.get('/api/result-runs', (_req, res) => {
  const now = Date.now();
  const runs = loadResultRuns(false)
    .filter(r => !r.expiresAt || Date.parse(r.expiresAt) > now)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(runs);
});

app.post('/api/result-runs', async (req, res) => {
  const { name, key, resultUrl, data, passed, failed, skipped, total } = req.body as Partial<StoredResultRun>;
  if (!data && !key) return res.status(400).json({ message: 'key or data is required' });
  const runs = loadResultRuns(true);
  const existing =
    (key ? runs.find(run => run.key === key) : undefined) ||
    (key
      ? (db.prepare(
          `SELECT id, createdAt, name, key, resultUrl, expiresAt, passed, failed, skipped, total,
                  (resultHtml IS NOT NULL AND length(resultHtml) > 0) as hasResultHtml
           FROM test_runs WHERE key = ?`
        ).get(key) as
          | Partial<StoredResultRun>
          | undefined)
      : undefined);
  const id = existing?.id || `${Date.now()}`;
  const createdAt = existing?.createdAt || new Date().toISOString();
  const effectiveResultUrl = key ? deriveStoredResultUrl(key, resultUrl, existing?.resultUrl) : resultUrl || existing?.resultUrl;
  const entry: StoredResultRun = {
    id,
    name: name || existing?.name || key || `Run ${createdAt}`,
    key,
    resultUrl: effectiveResultUrl,
    data,
    createdAt,
    expiresAt: existing?.expiresAt,
    passed: passed ?? existing?.passed,
    failed: failed ?? existing?.failed,
    skipped: skipped ?? existing?.skipped,
    total: total ?? existing?.total
  };
  const existingIdx = key ? runs.findIndex(run => run.key === key) : -1;
  if (existingIdx >= 0) {
    runs[existingIdx] = {
      ...runs[existingIdx],
      ...entry
    };
  } else {
    runs.push(entry);
  }
  saveResultRuns(runs);
  if (key) {
    await hydrateStoredResultHtml({
      id,
      key,
      name: entry.name,
      createdAt,
      resultUrl: effectiveResultUrl,
      existingResultHtml: Boolean(existing?.hasResultHtml)
    });
  }
  res.status(201).json(entry);
});

// Accept a summary-only payload (from Jenkins) when JSON artifacts are missing.
app.post('/api/results/upload-summary', async (req, res) => {
  const { key, name, resultUrl, passed, failed, skipped, total, createdAt } = req.body as {
    key?: string;
    name?: string;
    resultUrl?: string;
    passed?: number;
    failed?: number;
    skipped?: number;
    total?: number;
    createdAt?: string;
  };
  if (!key) return res.status(400).json({ message: 'key is required' });

  const safePassed = Number(passed ?? 0) || 0;
  const safeFailed = Number(failed ?? 0) || 0;
  const safeSkipped = Number(skipped ?? 0) || 0;
  const safeTotal = Number(total ?? safePassed + safeFailed + safeSkipped) || 0;

  const existing = db
    .prepare(
      `SELECT id, createdAt, name, resultUrl,
              (resultHtml IS NOT NULL AND length(resultHtml) > 0) as hasResultHtml
       FROM test_runs WHERE key = ?`
    )
    .get(key) as
    | { id: string; createdAt: string; name?: string; resultUrl?: string; hasResultHtml?: number }
    | undefined;
  const id = existing?.id || `${Date.now()}`;
  const createdAtIso = existing?.createdAt || createdAt || new Date().toISOString();
  const resultLink = deriveStoredResultUrl(key, resultUrl, existing?.resultUrl);

  upsertResultRunToDb({
    id,
    name: name || existing?.name || key,
    key,
    resultUrl: resultLink,
    createdAt: createdAtIso,
    data: undefined,
    passed: safePassed,
    failed: safeFailed,
    skipped: safeSkipped,
    total: safeTotal
  });
  await hydrateStoredResultHtml({
    id,
    key,
    name: name || existing?.name || key,
    createdAt: createdAtIso,
    resultUrl: resultLink,
    existingResultHtml: Boolean(existing?.hasResultHtml)
  });

  res.status(201).json({
    saved: true,
    key,
    runId: id,
    resultUrl: resultLink,
    passed: safePassed,
    failed: safeFailed,
    skipped: safeSkipped,
    total: safeTotal
  });
});

const DEFAULT_JENKINS_HTTP_TIMEOUT_MS = Math.max(1000, Number(process.env.JENKINS_HTTP_TIMEOUT_MS || 10000));
const DEFAULT_WEEKLY_STATUS_REFRESH_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.WEEKLY_STATUS_REFRESH_TIMEOUT_MS || 12000)
);

async function fetchJenkinsWithTimeout(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_JENKINS_HTTP_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      const timeoutError = new Error(`Jenkins request timed out after ${timeoutMs}ms`) as Error & {
        status?: number;
        details?: string;
      };
      timeoutError.status = 504;
      timeoutError.details = `Timed out while calling ${url}`;
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function awaitWithTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          const timeoutError = new Error(message) as Error & { status?: number };
          timeoutError.status = 504;
          reject(timeoutError);
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function fetchJenkinsCrumb(origin: string, authHeader: string): Promise<{ crumbHeader: Record<string, string>; crumbCookies: string }> {
  let crumbHeader: Record<string, string> = {};
  let crumbCookies = '';
  try {
    const crumbResp = await fetchJenkinsWithTimeout(`${origin}/crumbIssuer/api/json`, {
      headers: { Authorization: authHeader }
    });
    if (crumbResp.ok) {
      const crumbJson = (await crumbResp.json()) as { crumbRequestField?: string; crumb?: string };
      if (crumbJson.crumbRequestField && crumbJson.crumb) {
        crumbHeader = { [crumbJson.crumbRequestField]: crumbJson.crumb };
      }
      const rawHeaders = (crumbResp.headers as any)?.raw?.();
      const setCookie = rawHeaders ? rawHeaders['set-cookie'] : undefined;
      if (Array.isArray(setCookie) && setCookie.length) {
        crumbCookies = setCookie.map((c: string) => c.split(';')[0]).join('; ');
      }
    }
  } catch (err) {
    console.warn('Crumb fetch failed, proceeding without crumb:', err);
  }
  return { crumbHeader, crumbCookies };
}

async function triggerJenkinsBuildRequest(input: {
  jobUrl?: string;
  params?: Record<string, string>;
  cause?: string;
}): Promise<{ queued: true; message: string; queueUrl: string; queueId?: number }> {
  const user = process.env.JENKINS_USER;
  const token = process.env.JENKINS_TOKEN;
  const triggerToken = process.env.JENKINS_TRIGGER_TOKEN;
  const defaultJobUrl = process.env.JENKINS_JOB_URL || input.jobUrl || 'https://jenkins.otsops.com/job/POC_QA_DASHBOARD/buildWithParameters';

  console.log('[Jenkins trigger] incoming params', { jobUrl: defaultJobUrl, params: input.params });

  if (!user || !token) {
    const err = new Error('Jenkins credentials are not configured on the server.') as Error & { status?: number };
    err.status = 500;
    throw err;
  }
  if (!defaultJobUrl) {
    const err = new Error('jobUrl is required.') as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  const targetUrl = new URL(defaultJobUrl);
  const origin = `${targetUrl.protocol}//${targetUrl.host}`;
  const authHeader = 'Basic ' + Buffer.from(`${user}:${token}`).toString('base64');
  const { crumbHeader, crumbCookies } = await fetchJenkinsCrumb(origin, authHeader);

  const queryParams = new URLSearchParams();
  if (triggerToken) queryParams.append('token', triggerToken);
  if (input.cause) queryParams.append('cause', input.cause);
  const buildUrl = queryParams.toString() ? `${defaultJobUrl}?${queryParams.toString()}` : defaultJobUrl;

  const bodyParams = new URLSearchParams();
  Object.entries(input.params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) bodyParams.append(k, v);
  });

  const triggerResp = await fetchJenkinsWithTimeout(buildUrl, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...crumbHeader,
      ...(crumbCookies ? { cookie: crumbCookies } : {})
    },
    body: bodyParams.toString()
  });

  if (!triggerResp.ok) {
    const text = await triggerResp.text();
    const snippet = text ? text.slice(0, 4000) : '';
    console.error('[Jenkins trigger] non-200', triggerResp.status, {
      url: buildUrl,
      params: bodyParams.toString(),
      statusText: triggerResp.statusText,
      bodySnippet: snippet
    });
    const err = new Error('Failed to trigger Jenkins') as Error & {
      status?: number;
      statusText?: string;
      details?: string;
    };
    err.status = triggerResp.status;
    err.statusText = triggerResp.statusText;
    err.details = snippet;
    throw err;
  }

  const queueUrl = triggerResp.headers.get('location') || '';
  const queueId = queueUrl ? Number(queueUrl.split('/').filter(Boolean).pop()) : undefined;
  return { queued: true, message: 'Jenkins job triggered', queueUrl, queueId };
}

async function fetchJenkinsQueueItem(queueId: string | number): Promise<any> {
  const origin = getJenkinsOrigin();
  if (!origin) {
    const err = new Error('JENKINS_JOB_URL not set') as Error & { status?: number };
    err.status = 500;
    throw err;
  }
  const { authHeader } = getJenkinsAuth();
  const resp = await fetchJenkinsWithTimeout(`${origin}/queue/item/${queueId}/api/json`, {
    headers: { Authorization: authHeader }
  });
  if (!resp.ok) {
    const text = await resp.text();
    const err = new Error('Failed to fetch queue item') as Error & { status?: number; details?: string };
    err.status = resp.status;
    err.details = text;
    throw err;
  }
  return resp.json();
}

async function fetchJenkinsBuildData(buildUrl: string): Promise<any> {
  const origin = getJenkinsOrigin();
  if (!origin) {
    const err = new Error('JENKINS_JOB_URL not set') as Error & { status?: number };
    err.status = 500;
    throw err;
  }
  if (!buildUrl.startsWith(origin)) {
    const err = new Error('Invalid build URL') as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  const { authHeader } = getJenkinsAuth();
  const target = buildUrl.endsWith('/api/json') ? buildUrl : `${buildUrl.replace(/\/api\/json$/, '')}/api/json`;
  const resp = await fetchJenkinsWithTimeout(target, {
    headers: { Authorization: authHeader }
  });
  if (!resp.ok) {
    const text = await resp.text();
    const err = new Error('Failed to fetch build info') as Error & { status?: number; details?: string };
    err.status = resp.status;
    err.details = text;
    throw err;
  }

  const data = await resp.json();
  let parameters: Array<{ name: string; value: any }> = [];
  if (Array.isArray(data?.actions)) {
    for (const action of data.actions) {
      if (Array.isArray(action?.parameters)) {
        parameters = action.parameters;
        break;
      }
    }
  }
  const paramMap = new Map<string, any>();
  for (const p of parameters || []) {
    if (p?.name) paramMap.set(String(p.name), p.value);
  }

  let runPrefix =
    paramMap.get('RUN_PREFIX') ||
    paramMap.get('ARTIFACT_PREFIX') ||
    null;

  const deviceType = paramMap.get('DEVICE_TYPE');
  const preferredTarget =
    normalizeReportTargetValue(paramMap.get('REPORT_TARGET')) ||
    normalizeReportTargetValue(process.env.JENKINS_REPORT_TARGET || process.env.REPORT_TARGET);
  const deviceTarget = normalizeReportTargetValue(deviceType);
  const candidateTargets = Array.from(
    new Set([preferredTarget, deviceTarget, 'mobile_web', 'desktop_web'].filter(Boolean) as string[])
  );

  const buildMeta = (() => {
    try {
      const urlObj = new URL(buildUrl);
      const parts = urlObj.pathname.split('/').filter(Boolean);
      const jobSegments: string[] = [];
      for (let i = 0; i < parts.length; i += 1) {
        if (parts[i] === 'job' && parts[i + 1]) {
          jobSegments.push(parts[i + 1]);
        }
      }
      const jobName = jobSegments.length ? jobSegments.join('/') : null;
      const buildNumber = data?.number ?? (parts.length ? Number(parts[parts.length - 1]) : undefined);
      const ts = data?.timestamp;
      if (!jobName || !buildNumber || !ts) return null;
      const d = new Date(ts);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yy = String(d.getFullYear()).slice(-2);
      return {
        jobName,
        buildNumber,
        datePart: `${mm}-${dd}-${yy}`
      };
    } catch {
      return null;
    }
  })();

  const buildPrefixForTarget = (target: string) => {
    if (!buildMeta) return null;
    return `${buildMeta.datePart}/${target}/${buildMeta.jobName}/${buildMeta.buildNumber}/reports`;
  };

  const reportArtifactsExist = async (prefix: string): Promise<boolean> => {
    const keys = [
      `${prefix}/test.json`,
      `${prefix}/test.json.gz`,
      `${prefix}/test.json.zip`,
      `${prefix}/result.html`
    ];
    for (const key of keys) {
      if (await s3ObjectExists(key)) return true;
    }
    return false;
  };

  if (!runPrefix && buildMeta) {
    const buildDone = data?.building === false || !!data?.result;
    if (buildDone) {
      for (const target of candidateTargets) {
        const prefix = buildPrefixForTarget(target);
        if (!prefix) continue;
        if (await reportArtifactsExist(prefix)) {
          runPrefix = prefix;
          break;
        }
      }
    }
    if (!runPrefix) {
      const fallbackTarget = preferredTarget || deviceTarget || 'mobile_web';
      const fallbackPrefix = buildPrefixForTarget(fallbackTarget);
      if (fallbackPrefix) runPrefix = fallbackPrefix;
    }
  }

  return { ...data, parameters, runPrefix };
}

async function resolveWeeklyExecutionArtifacts(runPrefix: string): Promise<Partial<StoredWeeklyExecution>> {
  const prefix = String(runPrefix || '').replace(/\/+$/, '');
  if (!prefix) return {};

  const jsonKey = `${prefix}/test.json`;
  const htmlKey = `${prefix}/result.html`;
  const jsonCandidates = Array.from(
    new Set(
      expandDateVariants(jsonKey).flatMap(candidate => {
        const variants = [candidate, `${candidate}.gz`, `${candidate}.zip`];
        const cucumberCandidate = candidate.replace(/test\.json$/i, 'cucumber.json');
        variants.push(cucumberCandidate, `${cucumberCandidate}.gz`, `${cucumberCandidate}.zip`);
        return variants;
      })
    )
  );
  const patch: Partial<StoredWeeklyExecution> = {};

  const cachedRun = findStoredResultRunByKeys(jsonCandidates, true);
  const resolvedUrl = resolveStoredResultUrl(cachedRun) || presignS3GetUrl(htmlKey) || s3UrlForKey(htmlKey);
  if (resolvedUrl) {
    patch.resultsLink = resolvedUrl;
  }

  if (!cachedRun) {
    return patch;
  }

  const summary =
    cachedRun.total || cachedRun.passed || cachedRun.failed || cachedRun.skipped
      ? {
          passed: toFiniteNumber(cachedRun.passed),
          failed: toFiniteNumber(cachedRun.failed),
          skipped: toFiniteNumber(cachedRun.skipped),
          total: toFiniteNumber(
            cachedRun.total,
            toFiniteNumber(cachedRun.passed) + toFiniteNumber(cachedRun.failed) + toFiniteNumber(cachedRun.skipped)
          )
        }
      : Array.isArray(cachedRun.data) && cachedRun.data.length
        ? countStatuses(cachedRun.data)
        : null;

  if (summary) {
    patch.passed = summary.passed;
    patch.failed = summary.failed;
    patch.totalAutomated = summary.total > 0 ? summary.total : undefined;
    patch.passRate = computePassRate(summary.passed, summary.failed, 0);
  }

  return patch;
}

async function syncWeeklyExecution(execution: StoredWeeklyExecution): Promise<StoredWeeklyExecution> {
  let current = execution;

  if (current.status === 'QUEUED' && current.queueId) {
    try {
      const queueInfo = await fetchJenkinsQueueItem(current.queueId);
      if (queueInfo?.cancelled) {
        return saveWeeklyExecutionPatch(current.id, {
          status: 'FAILED',
          errorMessage: queueInfo?.why ? String(queueInfo.why) : 'Queue item was cancelled.'
        }) || current;
      }
      if (queueInfo?.executable?.url) {
        current =
          saveWeeklyExecutionPatch(current.id, {
            buildUrl: String(queueInfo.executable.url),
            buildNumber: toFiniteNumber(queueInfo.executable.number),
            status: 'RUNNING'
          }) || current;
      }
    } catch (err: any) {
      return saveWeeklyExecutionPatch(current.id, {
        errorMessage: String(err?.message || err)
      }) || current;
    }
  }

  if ((current.status === 'RUNNING' || current.status === 'QUEUED') && current.buildUrl) {
    try {
      const build = await fetchJenkinsBuildData(current.buildUrl);
      const buildNumber = build?.number ? toFiniteNumber(build.number) : current.buildNumber;
      const runPrefix = build?.runPrefix ? String(build.runPrefix) : current.runPrefix;

      if (build?.building) {
        return saveWeeklyExecutionPatch(current.id, {
          buildNumber,
          runPrefix,
          status: 'RUNNING'
        }) || current;
      }

      const result = String(build?.result || '').toUpperCase();
      const status: WeeklyJobStatus = result === 'SUCCESS' ? 'SUCCESS' : result ? 'FAILED' : 'RUNNING';
      const artifactPatch = runPrefix ? await resolveWeeklyExecutionArtifacts(runPrefix) : {};
      return (
        saveWeeklyExecutionPatch(current.id, {
          buildNumber,
          runPrefix,
          status,
          errorMessage: status === 'FAILED' && result ? result : current.errorMessage,
          ...artifactPatch
        }) || current
      );
    } catch (err: any) {
      return saveWeeklyExecutionPatch(current.id, {
        errorMessage: String(err?.message || err)
      }) || current;
    }
  }

  return current;
}

async function refreshWeeklyExecutionsForRange(weekStart: string, weekEnd: string): Promise<StoredWeeklyExecution[]> {
  const executions = listWeeklyExecutions(weekStart, weekEnd);
  const activeExecutions = executions.filter(
    execution => execution.status === 'QUEUED' || execution.status === 'RUNNING'
  );

  if (!activeExecutions.length) {
    return executions;
  }

  try {
    await awaitWithTimeout(
      Promise.allSettled(activeExecutions.map(execution => syncWeeklyExecution(execution))),
      DEFAULT_WEEKLY_STATUS_REFRESH_TIMEOUT_MS,
      `Weekly status refresh timed out after ${DEFAULT_WEEKLY_STATUS_REFRESH_TIMEOUT_MS}ms`
    );
  } catch (err: any) {
    console.warn('Weekly status refresh fallback', {
      weekStart,
      weekEnd,
      activeCount: activeExecutions.length,
      message: String(err?.message || err)
    });
  }

  return listWeeklyExecutions(weekStart, weekEnd);
}

function weeklyRowsToCsv(rows: WeeklyBoardRow[], executions: StoredWeeklyExecution[]): string {
  const header = [
    'Executed Week',
    'Platform',
    'Suite',
    'Tag',
    'Environment',
    'Browser',
    'Device Type',
    'Test Cases',
    'Application Coverage',
    'Automation Scripts',
    'Coverage %',
    'Passed',
    'Failed',
    'Passing Rate',
    'Results Link',
    'Execution Type',
    'Job Status',
    'Executed At'
  ];
  const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const executionByBoard = new Map<string, StoredWeeklyExecution>();
  for (const execution of executions) {
    if (!executionByBoard.has(execution.boardId)) executionByBoard.set(execution.boardId, execution);
  }
  const lines = rows.map(row => {
    const execution = executionByBoard.get(row.id);
    return [
      row.executedWeek,
      row.platform,
      row.suite,
      execution?.tag || '',
      execution?.environment || '',
      execution?.browser || '',
      execution?.deviceType || '',
      row.testCases,
      row.applicationCoverage === null || row.applicationCoverage === undefined ? '' : `${row.applicationCoverage}%`,
      row.automationScripts,
      `${row.coveragePercent.toFixed(2)}%`,
      row.passed,
      row.failed,
      row.passingRate ? `${row.passingRate.toFixed(2)}%` : '',
      row.resultsLink || '',
      row.execution,
      row.jobStatus,
      row.executedAt || ''
    ]
      .map(escapeCsv)
      .join(',');
  });
  return [header.map(escapeCsv).join(','), ...lines].join('\n');
}

async function triggerWeeklyJobForRange(
  job: WeeklyAutomationJobDefinition,
  range: { weekStart: string; weekEnd: string }
): Promise<StoredWeeklyExecution> {
  const seed = buildWeeklyExecutionSeed({
    boardId: job.boardId,
    jobId: job.id,
    label: job.label,
    tag: job.tag,
    environment: job.environment,
    browser: job.browser,
    deviceType: job.deviceType,
    executionType: job.executionType,
    status: 'QUEUED',
    executedWeekStart: range.weekStart,
    executedWeekEnd: range.weekEnd
  });

  const savedSeed = upsertWeeklyExecutionToDb(seed);
  try {
    const trigger = await triggerJenkinsBuildRequest({
      params: {
        FEATURE: job.tag,
        ENVIRONMENT: job.environment,
        BROWSER: job.browser,
        DEVICE_TYPE: job.deviceType
      },
      cause: `Weekly board ${range.weekStart} to ${range.weekEnd} :: ${job.label}`
    });

    return (
      saveWeeklyExecutionPatch(savedSeed.id, {
        queueId: trigger.queueId,
        queueUrl: trigger.queueUrl,
        status: 'QUEUED'
      }) || savedSeed
    );
  } catch (err: any) {
    return (
      saveWeeklyExecutionPatch(savedSeed.id, {
        status: 'FAILED',
        errorMessage: String(err?.details || err?.message || err)
      }) || savedSeed
    );
  }
}

function createHttpError(message: string, status = 400): Error & { status?: number } {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

const ON_DEMAND_APP_FOLDERS = new Set(['nbc_WP', 'nbc_mobweb']);
const ON_DEMAND_SUITE_FOLDERS = new Set(['Regression', 'Sanity', 'Unified']);

type NormalizedOnDemandTestCase = {
  appFolder: string;
  suiteFolder: string;
  fileName: string;
  relativePath: string;
};

function normalizeFeatureFileEntries(value: unknown): string[] {
  const rawItems = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\r?\n|,/) : [];
  const normalized = rawItems
    .map(item => String(item ?? '').trim())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function buildFeatureRelativePath(testCase: { appFolder: string; suiteFolder: string; fileName: string }): string {
  return `src/test/resources/features/${testCase.appFolder}/${testCase.suiteFolder}/${testCase.fileName}`;
}

function normalizeStructuredTestCases(value: unknown): Array<{ appFolder: string; suiteFolder: string; fileName: string }> {
  if (!Array.isArray(value)) return [];
  return value.map(entry => {
    const record = entry as Record<string, unknown>;
    return {
      appFolder: String(record?.appFolder ?? '').trim(),
      suiteFolder: String(record?.suiteFolder ?? '').trim(),
      fileName: String(record?.fileName ?? '').trim()
    };
  });
}

function validateFeatureFileTriggerBody(body: {
  environment?: unknown;
  browser?: unknown;
  deviceType?: unknown;
  branch?: unknown;
  testCases?: unknown;
  featureFiles?: unknown;
  jobUrl?: unknown;
  cause?: unknown;
}): {
  environment: string;
  browser: string;
  branch: string;
  featureFiles: string[];
  legacyFeatureFiles: string[];
  testCases?: NormalizedOnDemandTestCase[];
  deviceType?: string;
  jobUrl?: string;
  cause?: string;
} {
  const environment = normalizeOptionalString(body.environment);
  if (!environment) throw createHttpError('Environment is required.');

  const browser = normalizeOptionalString(body.browser);
  if (!browser) throw createHttpError('Browser is required.');

  const branch = normalizeOptionalString(body.branch);
  if (!branch) throw createHttpError('Branch is required.');
  if (!/^[A-Za-z0-9._/-]+$/.test(branch)) {
    throw createHttpError('Branch contains unsupported characters.');
  }

  const structuredTestCases = normalizeStructuredTestCases(body.testCases);
  if (structuredTestCases.length) {
    const dedupedTestCases: NormalizedOnDemandTestCase[] = [];
    const seenPaths = new Set<string>();

    for (let index = 0; index < structuredTestCases.length; index += 1) {
      const testCase = structuredTestCases[index];
      const rowNumber = index + 1;

      if (!testCase.fileName) continue;
      if (!ON_DEMAND_APP_FOLDERS.has(testCase.appFolder)) {
        throw createHttpError(`Invalid app folder for row ${rowNumber}.`);
      }
      if (!ON_DEMAND_SUITE_FOLDERS.has(testCase.suiteFolder)) {
        throw createHttpError(`Invalid suite folder for row ${rowNumber}.`);
      }
      if (!testCase.fileName.toLowerCase().endsWith('.feature')) {
        throw createHttpError(`Feature file in row ${rowNumber} must end with .feature.`);
      }
      if (/[\\/]/.test(testCase.fileName) || testCase.fileName.includes('..')) {
        throw createHttpError(`Provide only the feature file name in row ${rowNumber}, not a path.`);
      }

      const relativePath = buildFeatureRelativePath(testCase);
      if (seenPaths.has(relativePath)) continue;
      seenPaths.add(relativePath);
      dedupedTestCases.push({
        ...testCase,
        relativePath
      });
    }

    if (!dedupedTestCases.length) {
      throw createHttpError('Provide at least one feature file.');
    }
    if (dedupedTestCases.length > 20) {
      throw createHttpError('You can trigger at most 20 feature files at a time.');
    }

    return {
      environment,
      browser,
      branch,
      featureFiles: dedupedTestCases.map(testCase => testCase.relativePath),
      legacyFeatureFiles: dedupedTestCases.map(testCase => testCase.fileName),
      testCases: dedupedTestCases,
      deviceType: normalizeOptionalString(body.deviceType),
      jobUrl: normalizeOptionalString(body.jobUrl),
      cause: normalizeOptionalString(body.cause)
    };
  }

  const featureFiles = normalizeFeatureFileEntries(body.featureFiles);
  if (!featureFiles.length) {
    throw createHttpError('Provide at least one feature file.');
  }
  if (featureFiles.length > 20) {
    throw createHttpError('You can trigger at most 20 feature files at a time.');
  }

  for (const featureFile of featureFiles) {
    if (featureFile.length > 260) {
      throw createHttpError(`Feature file is too long: ${featureFile}`);
    }
    if (/[\r\n]/.test(featureFile)) {
      throw createHttpError(`Feature file contains an invalid line break: ${featureFile}`);
    }
  }

  return {
    environment,
    browser,
    branch,
    featureFiles,
    legacyFeatureFiles: featureFiles,
    deviceType: normalizeOptionalString(body.deviceType),
    jobUrl: normalizeOptionalString(body.jobUrl),
    cause: normalizeOptionalString(body.cause)
  };
}

// Jenkins trigger proxy (buildWithParameters)
app.post('/api/jenkins/trigger', async (req, res) => {
  const { jobUrl, params, cause } = req.body as { jobUrl?: string; params?: Record<string, string>; cause?: string };
  try {
    const result = await triggerJenkinsBuildRequest({ jobUrl, params, cause });
    return res.json(result);
  } catch (err: any) {
    if (err?.status) {
      return res.status(err.status).json({
        message: err.message || 'Failed to trigger Jenkins',
        statusText: err.statusText,
        details: err.details
      });
    }
    console.error('Jenkins trigger error', err);
    return res.status(500).json({ message: 'Error triggering Jenkins', error: String(err?.message || err) });
  }
});

app.post('/api/jenkins/trigger-feature-files', async (req, res) => {
  try {
    const payload = validateFeatureFileTriggerBody(req.body as {
      environment?: unknown;
      browser?: unknown;
      deviceType?: unknown;
      branch?: unknown;
      testCases?: unknown;
      featureFiles?: unknown;
      jobUrl?: unknown;
      cause?: unknown;
    });

    const result = await triggerJenkinsBuildRequest({
      jobUrl: payload.jobUrl,
      params: {
        EXECUTION_MODE: payload.testCases?.length ? 'FEATURE_PATHS' : 'FEATURE_FILES',
        FEATURE_FILES: payload.legacyFeatureFiles.join('\n'),
        FEATURE_PATHS: payload.featureFiles.join('\n'),
        BRANCH: payload.branch,
        ENVIRONMENT: payload.environment,
        BROWSER: payload.browser,
        ...(payload.testCases?.length
          ? {
              TEST_CASES_JSON: JSON.stringify(payload.testCases),
              FEATURE_ROOT: 'src/test/resources/features'
            }
          : {}),
        ...(payload.deviceType ? { DEVICE_TYPE: payload.deviceType } : {})
      },
      cause:
        payload.cause ||
        `On-demand feature-file execution :: ${payload.branch} :: ${payload.featureFiles.length} test case(s)`
    });

    return res.json({
      ...result,
      branch: payload.branch,
      featureFiles: payload.featureFiles,
      testCases: payload.testCases
    });
  } catch (err: any) {
    if (err?.status) {
      return res.status(err.status).json({
        message: err.message || 'Failed to trigger feature-file execution'
      });
    }
    console.error('Jenkins feature-file trigger error', err);
    return res.status(500).json({ message: 'Error triggering feature-file execution', error: String(err?.message || err) });
  }
});

// Helpers for Jenkins API proxying
function getJenkinsAuth() {
  const user = process.env.JENKINS_USER;
  const token = process.env.JENKINS_TOKEN;
  if (!user || !token) throw new Error('Jenkins credentials not configured');
  const authHeader = 'Basic ' + Buffer.from(`${user}:${token}`).toString('base64');
  return { authHeader, user, token };
}

function getJenkinsOrigin() {
  const jobUrl = process.env.JENKINS_JOB_URL;
  if (jobUrl) {
    const url = new URL(jobUrl);
    return `${url.protocol}//${url.host}`;
  }
  return null;
}

// Get queue item info
app.get('/api/jenkins/queue/:id', async (req, res) => {
  try {
    const data = await fetchJenkinsQueueItem(req.params.id);
    return res.json(data);
  } catch (err: any) {
    if (err?.status) {
      return res.status(err.status).json({ message: err.message || 'Failed to fetch queue item', details: err.details });
    }
    console.error('Jenkins queue fetch error', err);
    return res.status(500).json({ message: 'Error fetching Jenkins queue', error: String(err?.message || err) });
  }
});

// Cancel a queue item
app.post('/api/jenkins/queue/:id/cancel', async (req, res) => {
  try {
    const origin = getJenkinsOrigin();
    if (!origin) return res.status(500).json({ message: 'JENKINS_JOB_URL not set' });
    const { authHeader } = getJenkinsAuth();
    const queueId = req.params.id;
    const { crumbHeader, crumbCookies } = await fetchJenkinsCrumb(origin, authHeader);

    const resp = await fetchJenkinsWithTimeout(`${origin}/queue/item/${queueId}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        ...crumbHeader,
        ...(crumbCookies ? { cookie: crumbCookies } : {})
      }
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ message: 'Failed to cancel queue item', details: text.slice(0, 2000) });
    }
    res.json({ cancelled: true, queueId });
  } catch (err: any) {
    if (err?.status) {
      return res.status(err.status).json({ message: err.message || 'Failed to cancel queue item', details: err.details });
    }
    console.error('Jenkins queue cancel error', err);
    return res.status(500).json({ message: 'Error cancelling Jenkins queue item', error: String(err?.message || err) });
  }
});

// Get build info; expects a Jenkins build URL in query param `url`
app.get('/api/jenkins/build', async (req, res) => {
  try {
    const buildUrl = req.query.url as string | undefined;
    if (!buildUrl) return res.status(400).json({ message: 'url query param is required' });
    const data = await fetchJenkinsBuildData(buildUrl);
    return res.json(data);
  } catch (err: any) {
    if (err?.status) {
      return res.status(err.status).json({ message: err.message || 'Failed to fetch build info', details: err.details });
    }
    console.error('Jenkins build fetch error', err);
    return res.status(500).json({ message: 'Error fetching Jenkins build', error: String(err?.message || err) });
  }
});

// Stop a running build
app.post('/api/jenkins/build/stop', async (req, res) => {
  try {
    const buildUrl = req.body?.url as string | undefined;
    if (!buildUrl) return res.status(400).json({ message: 'url is required' });
    const origin = getJenkinsOrigin();
    if (!origin) return res.status(500).json({ message: 'JENKINS_JOB_URL not set' });
    if (!buildUrl.startsWith(origin)) return res.status(400).json({ message: 'Invalid build URL' });
    const { authHeader } = getJenkinsAuth();
    const { crumbHeader, crumbCookies } = await fetchJenkinsCrumb(origin, authHeader);

    const stopUrl = buildUrl.endsWith('/') ? `${buildUrl}stop` : `${buildUrl}/stop`;
    const resp = await fetchJenkinsWithTimeout(stopUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        ...crumbHeader,
        ...(crumbCookies ? { cookie: crumbCookies } : {})
      }
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ message: 'Failed to stop build', details: text.slice(0, 2000) });
    }
    res.json({ stopped: true, url: stopUrl });
  } catch (err: any) {
    if (err?.status) {
      return res.status(err.status).json({ message: err.message || 'Failed to stop build', details: err.details });
    }
    console.error('Jenkins stop build error', err);
    return res.status(500).json({ message: 'Error stopping Jenkins build', error: String(err?.message || err) });
  }
});

app.get('/api/automation/weekly-status', async (req, res) => {
  try {
    const range = resolveWorkingWeekRange(req.query.weekStart as string | undefined, req.query.weekEnd as string | undefined);
    const executions = await refreshWeeklyExecutionsForRange(range.weekStart, range.weekEnd);
    const payload = buildWeeklyStatusResponse(range.weekStart, range.weekEnd, executions, {
      platform: req.query.platform as string | undefined,
      suite: req.query.suite as string | undefined,
      executionType: req.query.executionType as string | undefined
    });

    return res.json({
      weekStart: range.weekStart,
      weekEnd: range.weekEnd,
      label: range.label,
      summary: payload.summary,
      rows: payload.rows
    });
  } catch (err: any) {
    console.error('Weekly status fetch error', err);
    return res.status(500).json({ message: 'Error loading weekly status board', error: String(err?.message || err) });
  }
});

app.post('/api/automation/weekly-status/run', async (req, res) => {
  try {
    const body = req.body as { weekStart?: string; weekEnd?: string };
    const range = resolveWorkingWeekRange(body.weekStart, body.weekEnd);
    const triggered: StoredWeeklyExecution[] = [];

    for (const job of WEEKLY_AUTOMATION_JOBS.filter(entry => entry.active)) {
      triggered.push(await triggerWeeklyJobForRange(job, range));
    }

    return res.json({
      weekStart: range.weekStart,
      weekEnd: range.weekEnd,
      triggered
    });
  } catch (err: any) {
    console.error('Weekly status run error', err);
    return res.status(500).json({ message: 'Error running weekly automation jobs', error: String(err?.message || err) });
  }
});

app.post('/api/automation/weekly-status/run/:jobId', async (req, res) => {
  try {
    const body = req.body as { weekStart?: string; weekEnd?: string };
    const range = resolveWorkingWeekRange(body.weekStart, body.weekEnd);
    const job = findWeeklyJobDefinitionById(req.params.jobId);

    if (!job || !job.active) {
      return res.status(404).json({ message: 'Weekly automation job not found.' });
    }

    const triggered = await triggerWeeklyJobForRange(job, range);
    return res.json({
      weekStart: range.weekStart,
      weekEnd: range.weekEnd,
      triggered
    });
  } catch (err: any) {
    console.error('Single weekly job run error', err);
    return res.status(500).json({ message: 'Error running weekly automation job', error: String(err?.message || err) });
  }
});

app.post('/api/automation/weekly-status/executions', (req, res) => {
  try {
    const body = req.body as Partial<StoredWeeklyExecution> & {
      weekStart?: string;
      weekEnd?: string;
    };
    const range = resolveWorkingWeekRange(body.executedWeekStart || body.weekStart, body.executedWeekEnd || body.weekEnd);
    const executionType = (String(body.executionType || 'ON_DEMAND').toUpperCase() as WeeklyExecutionType);
    const status = (String(body.status || 'QUEUED').toUpperCase() as WeeklyJobStatus);
    const existing = body.id ? getWeeklyExecution(body.id) : undefined;

    let saved: StoredWeeklyExecution;
    if (existing) {
      const patch: Partial<StoredWeeklyExecution> = {
        executionType,
        status,
        executedWeekStart: range.weekStart,
        executedWeekEnd: range.weekEnd,
        executedAt: body.executedAt || existing.executedAt
      };
      if (body.boardId !== undefined) patch.boardId = body.boardId;
      if (body.jobId !== undefined) patch.jobId = body.jobId;
      if (body.label !== undefined) patch.label = body.label;
      if (body.tag !== undefined) patch.tag = body.tag;
      if (body.environment !== undefined) patch.environment = body.environment;
      if (body.browser !== undefined) patch.browser = body.browser;
      if (body.deviceType !== undefined) patch.deviceType = body.deviceType;
      if (body.totalAutomated !== undefined) patch.totalAutomated = toFiniteNumber(body.totalAutomated);
      if (body.passed !== undefined) patch.passed = toFiniteNumber(body.passed);
      if (body.failed !== undefined) patch.failed = toFiniteNumber(body.failed);
      if (body.passRate !== undefined) patch.passRate = toFiniteNumber(body.passRate);
      if (body.resultsLink !== undefined) patch.resultsLink = body.resultsLink;
      if (body.queueId !== undefined) patch.queueId = toFiniteNumber(body.queueId);
      if (body.queueUrl !== undefined) patch.queueUrl = body.queueUrl;
      if (body.buildUrl !== undefined) patch.buildUrl = body.buildUrl;
      if (body.buildNumber !== undefined) patch.buildNumber = toFiniteNumber(body.buildNumber);
      if (body.runPrefix !== undefined) patch.runPrefix = body.runPrefix;
      if (body.errorMessage !== undefined) patch.errorMessage = body.errorMessage;
      saved =
        saveWeeklyExecutionPatch(existing.id, patch) || existing;
    } else {
      const seed = buildWeeklyExecutionSeed({
        id: body.id,
        boardId: body.boardId,
        jobId: body.jobId,
        label: body.label,
        tag: body.tag,
        environment: body.environment,
        browser: body.browser,
        deviceType: body.deviceType,
        executionType,
        status,
        executedAt: body.executedAt,
        executedWeekStart: range.weekStart,
        executedWeekEnd: range.weekEnd
      });
      saved = upsertWeeklyExecutionToDb({
        ...seed,
        queueId: body.queueId,
        queueUrl: body.queueUrl,
        buildUrl: body.buildUrl,
        buildNumber: body.buildNumber,
        runPrefix: body.runPrefix,
        resultsLink: body.resultsLink,
        passed: toFiniteNumber(body.passed),
        failed: toFiniteNumber(body.failed),
        totalAutomated: toFiniteNumber(body.totalAutomated, seed.totalAutomated),
        passRate: toFiniteNumber(body.passRate),
        errorMessage: body.errorMessage
      });
    }

    return res.status(existing ? 200 : 201).json(saved);
  } catch (err: any) {
    console.error('Weekly execution upsert error', err);
    return res.status(400).json({ message: 'Unable to save weekly execution', error: String(err?.message || err) });
  }
});

app.get('/api/automation/weekly-status/export', async (req, res) => {
  try {
    const range = resolveWorkingWeekRange(req.query.weekStart as string | undefined, req.query.weekEnd as string | undefined);
    const executions = await refreshWeeklyExecutionsForRange(range.weekStart, range.weekEnd);
    const platform = String(req.query.platform || '').toUpperCase();
    const suite = String(req.query.suite || '').toUpperCase();
    const executionType = String(req.query.executionType || '').toUpperCase();
    const filteredExecutions = executions.filter(execution => {
      if (platform && platform !== 'ALL' && execution.platform !== platform) return false;
      if (suite && suite !== 'ALL' && execution.suite !== suite) return false;
      if (executionType && executionType !== 'ALL' && execution.executionType !== executionType) return false;
      return true;
    });
    const payload = buildWeeklyStatusResponse(range.weekStart, range.weekEnd, executions, {
      platform: req.query.platform as string | undefined,
      suite: req.query.suite as string | undefined,
      executionType: req.query.executionType as string | undefined
    });
    const csv = weeklyRowsToCsv(payload.rows, filteredExecutions);
    const filename = `automation-weekly-status-${range.weekStart}-to-${range.weekEnd}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err: any) {
    console.error('Weekly status export error', err);
    return res.status(500).json({ message: 'Error exporting weekly status board', error: String(err?.message || err) });
  }
});

const PORT = APP_PORT;
app.listen(PORT, () => {
  console.log(`NBCuniversal backend listening on port ${PORT}`);
  scheduleEnvHealthAutoSync(PORT);
  
});
