// ═══════════════════════════════════════════════
// Datun AI — Secure Backend Server v2.0
// Built for Dr. Mayank Vats | datunai.com
// ═══════════════════════════════════════════════

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const { google } = require('googleapis');
const { Pool } = require('pg');

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
  'https://datunai-frontend.vercel.app',
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

async function initDB() {
  try {
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
        session_id VARCHAR(255)
      )
    `);
    console.log('✅ PostgreSQL connected & table ready');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
  }
}
initDB();

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
    console.log('✅ Saved to Google Sheets:', data.name, data.email);
  } catch (err) {
    console.error('❌ Sheets save error:', err.message);
  }
}

// ── SAVE TO POSTGRESQL ──
async function saveToDatabase(data) {
  try {
    await pool.query(
      `INSERT INTO consultations 
        (name, age, gender, email, chief_complaint, diagnosis, urgency, full_conversation, session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        data.name || '',
        data.age || '',
        data.gender || '',
        data.email || '',
        data.chiefComplaint || '',
        data.diagnosis || '',
        data.urgency || '',
        data.fullConversation || '',
        data.sessionId || ''
      ]
    );
    console.log('✅ Saved to PostgreSQL:', data.name, data.email);
  } catch (err) {
    console.error('❌ DB save error:', err.message);
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

// ── HEALTH CHECK ──
app.get('/', (req, res) => {
  res.json({
    status: 'Datun AI Backend is Live 🦷',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
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
      console.error('ANTHROPIC_API_KEY not set!');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: system || '',
        messages: messages
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        timeout: 60000
      }
    );

    res.json(response.data);

  } catch (error) {
    console.error('Chat error:', error.response?.data || error.message);

    if (error.response?.status === 401) {
      return res.status(500).json({ error: 'API authentication failed' });
    }
    if (error.response?.status === 429) {
      return res.status(429).json({ error: 'AI service busy. Please try again.' });
    }
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'Request timed out. Please try again.' });
    }

    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── SAVE CONSULTATION ──
app.post('/api/save-consultation', async (req, res) => {
  try {
    const { name, age, gender, email, messages, sessionId } = req.body;

    const { diagnosis, urgency, chiefComplaint } = extractAssessment(messages || []);

    const fullConversation = (messages || [])
      .filter(m => typeof m.content === 'string')
      .map(m => `${m.role === 'user' ? 'Patient' : 'Datun AI'}: ${m.content}`)
      .join('\n---\n')
      .slice(0, 5000);

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

    await saveToDatabase({
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

    res.json({ success: true });

  } catch (err) {
    console.error('Save error:', err.message);
    res.status(500).json({ error: err.message });
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
