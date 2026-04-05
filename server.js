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
const cron = require('node-cron');

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
    
    // WhatsApp system columns
    await pool.query(`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);`);
    await pool.query(`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS follow_up_3day_sent BOOLEAN DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS follow_up_7day_sent BOOLEAN DEFAULT FALSE;`);

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
async function saveToDatabase(data) {
  try {
    const res = await pool.query(
      `INSERT INTO consultations 
        (name, age, gender, email, chief_complaint, diagnosis, urgency, full_conversation, session_id, user_id, 
         location, pain_scale, medical_history, allergies, dental_history, provisional_diagnosis, 
         investigations, treatment_plan, medications, home_remedies, dos_and_donts, red_flags, phone_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23) RETURNING id`,
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
        data.red_flags || 'None',
        data.phoneNumber || ''
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
    
    // Translate non-English fields to English for PDF
    const fieldsToTranslate = ['chief_complaint','diagnosis','provisional_diagnosis','medications','home_remedies','dos_and_donts','treatment_plan','investigations','medical_history','allergies','dental_history','red_flags','location','pain_scale'];
    const hasNonEnglish = fieldsToTranslate.some(f => consultation[f] && /[^\x00-\x7F]/.test(consultation[f]));
    
    if(hasNonEnglish && process.env.ANTHROPIC_API_KEY){
      try {
        const dataToTranslate = {};
        fieldsToTranslate.forEach(f => { if(consultation[f]) dataToTranslate[f] = consultation[f]; });
        
        const transResponse = await axios.post('https://api.anthropic.com/v1/messages', {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: 'Translate the following medical/dental data to English. Keep medical terms, drug names, and dosages as-is. Return ONLY valid JSON with same keys. No markdown, no backticks, no explanation.\n\n' + JSON.stringify(dataToTranslate)
          }]
        }, {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          timeout: 30000
        });
        
        const transText = transResponse.data.content[0].text.trim();
        const translated = JSON.parse(transText);
        fieldsToTranslate.forEach(f => { if(translated[f]) consultation[f] = translated[f]; });
        logger.info('PDF translated to English for consultation ' + id);
      } catch(te) {
        logger.warn('Translation failed, generating PDF with original text: ' + te.message);
      }
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=DatunAI_Report_${id}.pdf`);
    
    generateConsultationPDF(consultation, res);
  } catch (err) {
    logger.error('PDF generation error: ' + err.message);
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

    const phoneNumber = req.body.phoneNumber || '';

    const newConsultationId = await saveToDatabase({
      name, age, gender, email, chiefComplaint, diagnosis, urgency, fullConversation, 
      sessionId: sessionId || Date.now().toString(),
      userId: userId || null,
      location, pain_scale, medical_history, allergies, dental_history, 
      provisional_diagnosis, investigations, treatment_plan, medications, 
      home_remedies, dos_and_donts, red_flags, phoneNumber
    });

    // ── WHATSAPP NOTIFICATIONS ──
    if (phoneNumber && diagnosis) {
      const patientPhone = phoneNumber.startsWith('91') ? phoneNumber : '91' + phoneNumber.replace(/^0+/, '');
      
      // 1. Patient ko — Consultation Complete
      await sendWhatsApp(patientPhone,
        `Namaste ${name || ''} ji! 😊\n\nAapki Datun AI dental consultation complete hui.\n\n🩺 Diagnosis: ${diagnosis}\n⚡ Urgency: ${urgency || 'ROUTINE'}\n\n📋 PDF Report: https://dentscan-ai-backend-production.up.railway.app/api/consultations/${newConsultationId}/pdf\n\nHumari team jald connect karegi.\n📞 +91 87960 64170\n🔗 www.datunai.com\n\n—\n\nHello ${name || ''}! 😊\n\nYour Datun AI consultation is complete.\n\n🩺 Diagnosis: ${diagnosis}\n⚡ Urgency: ${urgency || 'ROUTINE'}\n\n📋 PDF Report: https://dentscan-ai-backend-production.up.railway.app/api/consultations/${newConsultationId}/pdf\n\nOur team will connect shortly.\n📞 +91 87960 64170\n🔗 www.datunai.com\n\n— Datun AI`
      );

      // 2. Internal Alert — Tujhe (8796064170 pe)
      await sendWhatsApp('918796064170',
        `🚨 NEW PATIENT ALERT\n\n👤 Name: ${name || 'Unknown'}\n📞 Phone: ${phoneNumber}\n📧 Email: ${email || 'N/A'}\n🩺 Diagnosis: ${diagnosis}\n⚡ Urgency: ${urgency || 'ROUTINE'}\n🎂 Age: ${age || 'N/A'}\n⚧ Gender: ${gender || 'N/A'}\n\n📋 PDF: https://dentscan-ai-backend-production.up.railway.app/api/consultations/${newConsultationId}/pdf\n\n— Datun AI System`
      );

      logger.info('WhatsApp notifications sent for consultation: ' + newConsultationId);
    }
    
    res.json({ success: true, consultationId: newConsultationId });

  } catch (err) {
    Sentry.captureException(err);
    logger.error('Save error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CRON JOBS — Automated Follow-ups
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Daily 10am IST — 3-day follow-up
cron.schedule('0 10 * * *', async () => {
  logger.info('Running 3-day follow-up cron...');
  try {
    const result = await pool.query(
      `SELECT id, name, phone_number, chief_complaint FROM consultations 
       WHERE timestamp::date = (NOW() - INTERVAL '3 days')::date 
       AND phone_number IS NOT NULL AND phone_number != '' 
       AND follow_up_3day_sent = FALSE`
    );
    for (const row of result.rows) {
      const phone = row.phone_number.startsWith('91') ? row.phone_number : '91' + row.phone_number.replace(/^0+/, '');
      await sendWhatsApp(phone,
        `Namaste ${row.name || ''} ji! 😊\n\n3 din pehle aapne Datun AI se dental consult kiya tha.\n\nAb kaisa hai? Dentist ke paas gaye?\n\nDobara consult karein:\n🔗 www.datunai.com\n📞 +91 87960 64170\n\n—\n\nHello ${row.name || ''}! 😊\n\nIt's been 3 days since your dental consultation.\n\nHow are you feeling? Did you visit a dentist?\n\nConsult again:\n🔗 www.datunai.com\n📞 +91 87960 64170\n\n— Datun AI`
      );
      await pool.query('UPDATE consultations SET follow_up_3day_sent = TRUE WHERE id = $1', [row.id]);
      logger.info('3-day follow-up sent to: ' + row.phone_number);
    }
  } catch (err) {
    logger.error('3-day cron error: ' + err.message);
    Sentry.captureException(err);
  }
}, { timezone: 'Asia/Kolkata' });

// Daily 10am IST — 7-day follow-up
cron.schedule('30 10 * * *', async () => {
  logger.info('Running 7-day follow-up cron...');
  try {
    const result = await pool.query(
      `SELECT id, name, phone_number, chief_complaint FROM consultations 
       WHERE timestamp::date = (NOW() - INTERVAL '7 days')::date 
       AND phone_number IS NOT NULL AND phone_number != '' 
       AND follow_up_7day_sent = FALSE`
    );
    for (const row of result.rows) {
      const phone = row.phone_number.startsWith('91') ? row.phone_number : '91' + row.phone_number.replace(/^0+/, '');
      await sendWhatsApp(phone,
        `Namaste ${row.name || ''} ji! 🦷\n\nEk hafte pehle aapko "${row.chief_complaint || 'dental'}" ki takleef thi.\n\nDentist se mile? Agar nahi toh hum help kar sakte hain:\n📞 +91 87960 64170\n🔗 www.datunai.com\n\n—\n\nHello ${row.name || ''}! 🦷\n\nA week ago you consulted for "${row.chief_complaint || 'dental issue'}".\n\nHave you seen a dentist? We can help:\n📞 +91 87960 64170\n🔗 www.datunai.com\n\n— Datun AI`
      );
      await pool.query('UPDATE consultations SET follow_up_7day_sent = TRUE WHERE id = $1', [row.id]);
      logger.info('7-day follow-up sent to: ' + row.phone_number);
    }
  } catch (err) {
    logger.error('7-day cron error: ' + err.message);
    Sentry.captureException(err);
  }
}, { timezone: 'Asia/Kolkata' });

// ── START SERVER ──
const startServer = async () => {
  try {
    // Pehle DB setup karo
    await initDB(); 
    
    app.listen(PORT, () => {
      console.log(`
  ╔═══════════════════════════════════════╗
  ║        Datun AI Backend Running 🦷      ║
  ║        Port: ${PORT}                      ║
  ║        Version: 2.0.1                  ║
  ║        Sheets: Connected               ║
  ╚═══════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error("Failed to start server: " + error.message);
    process.exit(1);
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DATUN AI — WhatsApp Cloud API Integration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── SEND WHATSAPP MESSAGE HELPER ──
async function sendWhatsApp(to, body) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      { messaging_product: 'whatsapp', to, type: 'text', text: { body } },
      { headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    logger.info('WhatsApp message sent to: ' + to);
  } catch (err) {
    logger.error('WhatsApp send error: ' + err.message);
    Sentry.captureException(err);
  }
}

// ── SEND WHATSAPP TEMPLATE HELPER ──
async function sendWhatsAppTemplate(to, templateName, components) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components: components || []
        }
      },
      { headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    logger.info('WhatsApp template sent: ' + templateName + ' to ' + to);
  } catch (err) {
    logger.error('WhatsApp template error: ' + err.message);
    Sentry.captureException(err);
  }
}

// ── WEBHOOK VERIFY (Meta calls this to verify your endpoint) ──
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ── WEBHOOK RECEIVE (When patient replies on WhatsApp) ──
app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const from = message.from;

    // Quick Reply buttons come as type "button", normal messages as "text"
    let msgBody = '';
    if (message.type === 'button') {
      msgBody = message.button?.text?.trim() || '';
    } else if (message.type === 'text') {
      msgBody = message.text?.body?.trim() || '';
    } else if (message.type === 'interactive') {
      msgBody = message.interactive?.button_reply?.title?.trim() || '';
    }

    if (!msgBody) return res.sendStatus(200);

    logger.info('WhatsApp message from: ' + from + ' — ' + msgBody);

    const msgLower = msgBody.toLowerCase();

    // ── BUTTON HANDLERS ──

    // BOOK APPOINTMENT
    if (msgLower === 'book appointment') {
      await sendWhatsApp(from,
        `Thank you! 😊\n\nYour appointment request has been received.\n\nOur care team will contact you within 30 minutes to confirm your appointment with the right dentist near you.\n\nNeed urgent help?\n📞 +91 87960 64170\n\nEveryone Deserves a Doctor.\n— Datun AI`
      );
      // Internal alert
      await sendWhatsApp('918796064170',
        `📅 APPOINTMENT REQUEST\n\n📞 Patient: ${from}\n🕐 Requested just now\n\nAction: Contact patient within 30 minutes.\n\n— Datun AI System`
      );
    }

    // STILL IN PAIN
    else if (msgLower === 'still in pain') {
      await sendWhatsApp(from,
        `We're sorry to hear that. Your health is our priority.\n\nWe strongly recommend visiting a dentist at the earliest. Our care team will reach out to you shortly to help book an appointment.\n\nNeed immediate help?\n📞 +91 87960 64170\n\nEveryone Deserves a Doctor.\n— Datun AI`
      );
      // URGENT internal alert
      await sendWhatsApp('918796064170',
        `🚨 URGENT — PATIENT STILL IN PAIN\n\n📞 Patient: ${from}\n⏰ 3-day follow-up response\n⚡ Status: Still in pain\n\nAction Required: Contact patient IMMEDIATELY.\n\n— Datun AI System`
      );
    }

    // FEELING BETTER
    else if (msgLower === 'feeling better') {
      await sendWhatsApp(from,
        `That's wonderful to hear! 😊\n\nKeep following your care instructions from the report. If anything changes, we're always here.\n\nAsk Datun. · datunai.com\n\n— Datun AI`
      );
    }

    // VIEW REPORT
    else if (msgLower === 'view report') {
      // Fetch latest consultation for this number
      try {
        const phoneClean = from.replace(/^91/, '');
        const dbResult = await pool.query(
          `SELECT id FROM consultations WHERE phone_number LIKE $1 ORDER BY timestamp DESC LIMIT 1`,
          ['%' + phoneClean]
        );
        if (dbResult.rows.length > 0) {
          const cId = dbResult.rows[0].id;
          await sendWhatsApp(from,
            `Here's your latest dental report:\n\n📋 https://dentscan-ai-backend-production.up.railway.app/api/consultations/${cId}/pdf\n\nTap the link to view and download.\n\n— Datun AI`
          );
        } else {
          await sendWhatsApp(from,
            `We couldn't find a report linked to this number.\n\nStart a consultation:\n🔗 www.datunai.com\n\n— Datun AI`
          );
        }
      } catch (dbErr) {
        logger.error('View report DB error: ' + dbErr.message);
        await sendWhatsApp(from,
          `Something went wrong. Please try again or visit:\n🔗 www.datunai.com\n\n— Datun AI`
        );
      }
    }

    // TALK TO US / TALK TO OUR TEAM
    else if (msgLower === 'talk to us' || msgLower === 'talk to our team') {
      await sendWhatsApp(from,
        `Our care team is here for you.\n\nYou can reach us directly:\n📞 Call/WhatsApp: +91 87960 64170\n\nOr reply here — we're listening.\n\nEveryone Deserves a Doctor.\n— Datun AI`
      );
      // Alert
      await sendWhatsApp('918796064170',
        `💬 PATIENT WANTS TO TALK\n\n📞 Patient: ${from}\n\nAction: Reach out to patient.\n\n— Datun AI System`
      );
    }

    // CONFIRM (Appointment)
    else if (msgLower === 'confirm') {
      await sendWhatsApp(from,
        `Your appointment is confirmed! ✅\n\nRemember to carry your Datun AI dental report for the dentist's reference.\n\nSee you there!\n\n— Datun AI`
      );
    }

    // RESCHEDULE
    else if (msgLower === 'reschedule') {
      await sendWhatsApp(from,
        `No problem at all.\n\nOur care team will contact you shortly to find a better time.\n\n📞 +91 87960 64170\n\n— Datun AI`
      );
      await sendWhatsApp('918796064170',
        `🔄 RESCHEDULE REQUEST\n\n📞 Patient: ${from}\n\nAction: Contact patient to reschedule appointment.\n\n— Datun AI System`
      );
    }

    // GET DIRECTIONS
    else if (msgLower === 'get directions') {
      await sendWhatsApp(from,
        `Please share your location or the clinic name, and we'll help you with directions.\n\nOr call us:\n📞 +91 87960 64170\n\n— Datun AI`
      );
    }

    // HELPFUL (Weekly Tip)
    else if (msgLower === 'helpful') {
      await sendWhatsApp(from,
        `Glad you found it useful! 😊\n\nWe'll keep sharing tips every week to help you maintain great dental health.\n\nAsk Datun. · datunai.com\n\n— Datun AI`
      );
    }

    // ASK A QUESTION
    else if (msgLower === 'ask a question') {
      await sendWhatsApp(from,
        `Of course! Type your dental question below and our care team will get back to you.\n\nOr start a detailed AI consultation:\n🔗 www.datunai.com\n\n— Datun AI`
      );
      await sendWhatsApp('918796064170',
        `❓ PATIENT QUESTION INCOMING\n\n📞 Patient: ${from}\n\nAction: Monitor for follow-up message.\n\n— Datun AI System`
      );
    }

    // UNSUBSCRIBE
    else if (msgLower === 'unsubscribe') {
      await sendWhatsApp(from,
        `You've been unsubscribed from weekly tips.\n\nYou can always consult us anytime:\n🔗 www.datunai.com\n\nTake care!\n\n— Datun AI`
      );
      // Mark in DB — future use
      try {
        const phoneClean = from.replace(/^91/, '');
        await pool.query(
          `UPDATE consultations SET follow_up_7day_sent = TRUE, follow_up_3day_sent = TRUE WHERE phone_number LIKE $1`,
          ['%' + phoneClean]
        );
      } catch (dbErr) {
        logger.error('Unsubscribe DB error: ' + dbErr.message);
      }
      logger.info('Patient unsubscribed: ' + from);
    }

    // CALL PATIENT / MARK DONE (Internal — your buttons)
    else if (msgLower === 'call patient' || msgLower === 'mark done') {
      await sendWhatsApp(from,
        `Noted ✅\n\n— Datun AI System`
      );
    }

    // DEFAULT — Any other message
    else {
      await sendWhatsApp(from,
        `Hi there! 👋\n\nThank you for reaching out to Datun AI.\n\nYour message has been received. Our care team will get back to you shortly.\n\n📞 +91 87960 64170\n🔗 datunai.com\n\n—\n\nNamaste! 🙏\n\nDatun AI mein aapka swagat hai.\n\nAapka message mil gaya hai. Humari team jald aapse sampark karegi.\n\n📞 +91 87960 64170\n🔗 datunai.com\n\nEveryone Deserves a Doctor.\n— Datun AI`
      );
    }

    res.sendStatus(200);
  } catch (err) {
    logger.error('WhatsApp webhook error: ' + err.message);
    Sentry.captureException(err);
    res.sendStatus(200);
  }
});
startServer();
