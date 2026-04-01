// ═══════════════════════════════════════════════
// Datun AI — Secure Backend Server v2.0
// Built for Dr. Mayank Vats | datunai.com
// ═══════════════════════════════════════════════

require('dotenv').config();
const logger = require('./logger');
const Sentry = require("@sentry/node");
Sentry.init({ dsn: process.env.SENTRY_DSN });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const { google } = require('googleapis');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { generateConsultationPDF } = require('./utils/generateReport');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);

// ── SECURITY MIDDLEWARE ──
app.use(helmet());
app.use(express.json({ limit: '20mb' }));

// ── CORS ──
const allowedOrigins = [
  'https://datunai.com',
  'https://www.datunai.com',
  'http://localhost:3000',
  'http://127.0.0.1:5500'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

// ── RATE LIMITING ──
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many requests. Please try again later.' }
});

const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Slow down! Max 10 messages per minute.' }
});

app.use('/api/', limiter);
app.use('/api/chat', strictLimiter);

// ── POSTGRESQL SETUP ──
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ── AUTH0 JWT VERIFICATION ──
const auth0Domain = process.env.AUTH0_DOMAIN;
const jwks = jwksClient({
  jwksUri: `https://${auth0Domain}/.well-known/jwks.json`,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 5
});

function getKey(header, callback) {
  jwks.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

function verifyAuth0Token(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, {
      audience: process.env.AUTH0_CLIENT_ID,
      issuer: `https://${auth0Domain}/`,
      algorithms: ['RS256']
    }, (err, decoded) => {
      if (err) return reject(err);
      resolve(decoded);
    });
  });
}

async function initDB() {
  logger.info('🔄 DB Initialization started...'); // Step 1
  try {
    logger.info('⏳ Connecting to Pool...'); // Step 2
    
    // Test connection immediately
    const client = await pool.connect();
    logger.info('✅ Physical Connection Established!'); // Step 3
    client.release();

    logger.info('🔨 Syncing Users Table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        auth0_id VARCHAR(255) UNIQUE,
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE,
        picture VARCHAR(500),
        preferred_language VARCHAR(20) DEFAULT 'en',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_active TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    logger.info('🔨 Syncing Consultations Table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS consultations (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        name VARCHAR(255),
        age VARCHAR(10),
        gender VARCHAR(20),
        email VARCHAR(255),
        chief_complaint TEXT,
        diagnosis TEXT,
        urgency VARCHAR(50),
        full_conversation TEXT,
        session_id VARCHAR(255),
        user_id UUID REFERENCES users(id)
      )
    `);

    const newColumns = [
      'location', 'pain_scale', 'medical_history', 'allergies', 
      'dental_history', 'provisional_diagnosis', 'investigations', 
      'treatment_plan', 'medications', 'home_remedies', 'dos_and_donts', 'red_flags'
    ];

    logger.info('🔨 Checking for missing columns...');
    for (const col of newColumns) {
      await pool.query(`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS ${col} TEXT;`);
    }

    logger.info('🚀 PostgreSQL connected & ALL columns successfully updated!'); 
  } catch (err) {
    Sentry.captureException(err);
    logger.error('❌ DB init error: ' + err.message);
    // Agar error aaye toh poora stack trace print karo taaki humein wajah mile
    console.error(err); 
  }
}

// ── GOOGLE SHEETS SETUP ──
const SHEET_ID = process.env.GOOGLE_SHEET_ID || process.env.GOOGLE_SHEETS_ID;
const SERVICE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

async function getSheetsClient() {
  const auth = new google.auth.JWT(
    SERVICE_EMAIL,
    null,
    PRIVATE_KEY,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  return google.sheets({ version: 'v4', auth });
}

async function saveToSheets(data) {
  try {
    const sheets = await getSheetsClient();
    const row = [
      data.timestamp,
      data.name || '',
      data.age || '',
      data.gender || '',
      data.email || '',
      data.chiefComplaint || '',
      data.diagnosis || '',
      data.urgency || '',
      data.fullConversation || '',
      data.sessionId || ''
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A:J',
      valueInputOption: 'RAW',
      requestBody: { values: [row] }
    });
    logger.info('Saved to Google Sheets: ' + data.name + ' ' + data.email);
  } catch (err) {
    Sentry.captureException(err);
    logger.error('Sheets save error: ' + err.message);
  }
}

// ── SAVE TO POSTGRESQL ──
// ── SAVE TO POSTGRESQL ──
async function saveToDatabase(data) {
  try {
    const res = await pool.query(
      `INSERT INTO consultations 
        (name, age, gender, email, chief_complaint, diagnosis, urgency, full_conversation, session_id, user_id, 
         location, pain_scale, medical_history, allergies, dental_history, provisional_diagnosis, 
         investigations, treatment_plan, medications, home_remedies, dos_and_donts, red_flags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22) RETURNING id`,
      [
        data.name || '',
        data.age || '',
        data.gender || '',
        data.email || '',
        data.chiefComplaint || '',
        data.diagnosis || '',
        data.urgency || '',
        data.fullConversation || '',
        data.sessionId || '',
        data.userId || null,
        data.location || 'Not reported',
        data.pain_scale || 'Not reported',
        data.medical_history || 'Not reported',
        data.allergies || 'Not reported',
        data.dental_history || 'Not reported',
        data.provisional_diagnosis || 'Pending',
        data.investigations || 'Not reported',
        data.treatment_plan || 'Not reported',
        data.medications || 'Not reported',
        data.home_remedies || 'Not reported',
        data.dos_and_donts || 'Not reported',
        data.red_flags || 'None'
      ]
    );
    
    const newId = res.rows[0].id;
    logger.info('Saved to PostgreSQL with ID ' + newId + ': ' + data.name);
    return newId;
    
  } catch (err) {
    Sentry.captureException(err);
    logger.error('DB save error: ' + err.message);
    throw err;
  }
}

// ── HELPER: Extract diagnosis & urgency ──
function extractAssessment(messages) {
  let diagnosis = '';
  let urgency = '';
  let chiefComplaint = '';

  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : '';

    if (msg.role === 'user' && !chiefComplaint && content.length > 3) {
      chiefComplaint = content.slice(0, 200);
    }

    if (msg.role === 'assistant' && content.includes('[RX_START]')) {
      const diagMatch = content.match(/DIAGNOSIS:\s*([^\n]+)/);
      const urgMatch = content.match(/URGENCY:\s*([^\n]+)/);
      if (diagMatch) diagnosis = diagMatch[1].trim();
      if (urgMatch) urgency = urgMatch[1].trim();
    }
  }

  return { diagnosis, urgency, chiefComplaint };
}

// ── ROOT ──
app.get('/', (req, res) => {
  res.json({
    status: 'Datun AI Backend is Live 🦷',
    version: '2.0.1',
    timestamp: new Date().toISOString()
  });
});

// ── HEALTH CHECK ──
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({
      status: 'ok',
      server: 'running',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({
      status: 'error',
      server: 'running',
      database: 'disconnected',
      error: error.message
    });
  }
});

// ── UPTIMEROBOT FIX (HEAD SUPPORT) ──
app.head('/health', (req, res) => {
  res.status(200).end();
});

// ── MAIN CHAT ENDPOINT ──
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, system } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    if (messages.length > 100) {
      return res.status(400).json({ error: 'Conversation too long' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // ── RETRY LOGIC ──
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: 'claude-sonnet-4-20250514', // 
            max_tokens: 2000,
            system: [
              {
                type: "text",
                text: system || '',
                cache_control: { type: "ephemeral" } // 
              }
            ],
            messages: messages
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': process.env.ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
              'anthropic-beta': 'prompt-caching-2024-07-31' // 
            },
            timeout: 60000
          }
        );
        console.log("Token Usage:", JSON.stringify(response.data.usage));
        return res.json(response.data);
      } catch (err) {
        lastError = err;
        if (attempt < 3) {
          logger.warn(`Claude API attempt ${attempt} failed. Retrying...`);
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }

    // All retries failed
    Sentry.captureException(lastError);
    logger.error('Chat error after 3 attempts: ' + JSON.stringify(lastError.response?.data || lastError.message));

    if (lastError.response?.status === 401) {
      return res.status(500).json({ error: 'API authentication failed' });
    }
    if (lastError.response?.status === 429) {
      return res.status(429).json({ error: 'AI service busy. Please try again in a moment.' });
    }
    if (lastError.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'Request timed out. Please try again.' });
    }

    // Language-aware error message
    const lang = (system || '').toLowerCase().includes('hindi') ? 'hi' : 'en';
    const errorMsg = lang === 'hi'
      ? 'Kuch gadbad hui. Dobara try karein. 🙏'
      : 'Something went wrong. Please try again. 🙏';
    res.status(500).json({ error: errorMsg });

  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── AUTH: SAVE USER AFTER LOGIN ──
app.post('/api/auth/user', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const userInfo = await axios.get('https://' + auth0Domain + '/userinfo', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const { sub: auth0Id, name, email, picture } = userInfo.data;
    const result = await pool.query(`
      INSERT INTO users (auth0_id, name, email, picture, preferred_language, last_active)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (auth0_id) DO UPDATE
        SET name = EXCLUDED.name,
            email = EXCLUDED.email,
            picture = EXCLUDED.picture,
            preferred_language = COALESCE(EXCLUDED.preferred_language, users.preferred_language),
            last_active = NOW()
      RETURNING id, preferred_language
    `, [auth0Id, name || '', email || '', picture || '', req.body.preferred_language || 'en']);
    const user = result.rows[0];
    logger.info('User saved: ' + email);
    res.json({ success: true, name, email, picture, userId: user.id, preferred_language: user.preferred_language });
  } catch (err) {
    Sentry.captureException(err);
    logger.error('Auth user error: ' + err.message);
    res.status(500).json({ error: 'Failed to save user' });
  }
});
// ── GET USER CONSULTATIONS (HISTORY) ──
app.get('/api/user/consultations', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
   const token = authHeader.split(' ')[1];
    const userInfo = await axios.get('https://' + auth0Domain + '/userinfo', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const userResult = await pool.query('SELECT id FROM users WHERE auth0_id = $1', [userInfo.data.sub]);
    if (!userResult.rows.length) return res.json({ consultations: [] });
    const userId = userResult.rows[0].id;
    const result = await pool.query(
      'SELECT id, timestamp, chief_complaint, diagnosis, urgency, age, gender FROM consultations WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 20',
      [userId]
    );
    res.json({ consultations: result.rows });
  } catch (err) {
    Sentry.captureException(err);
    logger.error('History fetch error: ' + err.message);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Task 19: PDF Generation Endpoint
app.get('/api/consultations/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM consultations WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Report not found" });
    
    const consultation = result.rows[0];
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=DatunAI_Report_${id}.pdf`);
    
    generateConsultationPDF(consultation, res);
  } catch (err) {
    res.status(500).json({ error: "PDF generation failed" });
  }
});

// ── GET SINGLE CONSULTATION ──
app.get('/api/user/consultation/:id', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const userInfo = await axios.get('https://' + auth0Domain + '/userinfo', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const userResult = await pool.query('SELECT id FROM users WHERE auth0_id = $1', [userInfo.data.sub]);
    if (!userResult.rows.length) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;
    const result = await pool.query(
      'SELECT * FROM consultations WHERE id = $1 AND user_id = $2',
      [req.params.id, userId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Consultation not found' });
    res.json({ consultation: result.rows[0] });
  } catch (err) {
    Sentry.captureException(err);
    logger.error('Consultation fetch error: ' + err.message);
    res.status(500).json({ error: 'Failed to fetch consultation' });
  }
});

// ── SAVE CONSULTATION ──
app.post('/api/save-consultation', async (req, res) => {
  try {
    // 🔥 Naya data (location, pain_scale etc) bhi extract kar rahe hain
    const { 
      name, age, gender, email, messages, sessionId, userId,
      location, pain_scale, medical_history, allergies, dental_history, 
      provisional_diagnosis, investigations, treatment_plan, medications, 
      home_remedies, dos_and_donts, red_flags
    } = req.body;

    const { diagnosis, urgency, chiefComplaint } = extractAssessment(messages || []);

    const fullConversation = (messages || [])
      .filter(m => typeof m.content === 'string')
      .map(m => `${m.role === 'user' ? 'Patient' : 'Datun AI'}: ${m.content}`)
      .join('\n---\n')
      .slice(0, 50000);

    await saveToSheets({
      timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      name,
      age,
      gender,
      email,
      chiefComplaint,
      diagnosis,
      urgency,
      fullConversation,
      sessionId: sessionId || Date.now().toString()
    });

    // 🔥 Naya data ab saveToDatabase ko jaa raha hai
    const newConsultationId = await saveToDatabase({
      name, age, gender, email, chiefComplaint, diagnosis, urgency, fullConversation, 
      sessionId: sessionId || Date.now().toString(),
      userId: userId || null,
      location, pain_scale, medical_history, allergies, dental_history, 
      provisional_diagnosis, investigations, treatment_plan, medications, 
      home_remedies, dos_and_donts, red_flags
    });
    
    res.json({ success: true, consultationId: newConsultationId });

  } catch (err) {
    Sentry.captureException(err);
    logger.error('Save error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PDF REPORT GENERATION ENDPOINT ──
app.get('/api/consultations/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Fetch consultation data by ID from PostgreSQL
    const result = await pool.query('SELECT * FROM consultations WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Consultation report not found." });
    }
    
    const consultation = result.rows[0];
    
    // Set headers to force PDF download in the browser
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=DatunAI_Report_${id}.pdf`);
    
    // Generate the branded PDF and stream it to the client
    generateConsultationPDF(consultation, res);
    
  } catch (err) {
    logger.error(`PDF generation error: ${err.message}`);
    res.status(500).json({ error: "Failed to generate PDF report." });
  }
});

// ── START SERVER ──
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║       Datun AI Backend Running 🦷      ║
  ║       Port: ${PORT}                      ║
  ║       Version: 2.0.0                  ║
  ║       Sheets: Connected               ║
  ╚═══════════════════════════════════════╝
  `);
});
