// ═══════════════════════════════════════════════
// Datun AI — Premium Clinical Report Generator
// Built by CTO · datunai.com
// ═══════════════════════════════════════════════

const PDFDocument = require('pdfkit');

function generateConsultationPDF(data, stream) {
  const doc = new PDFDocument({ 
    size: 'A4', 
    margins: { top: 0, bottom: 40, left: 40, right: 40 },
    bufferPages: true,
    info: {
      Title: `Datun AI — Dental Report #DTN-${data.id || '000'}`,
      Author: 'Datun AI by Dr. Mayank Vats',
      Subject: 'AI Dental Triage Report',
      Creator: 'datunai.com'
    }
  });

  // ─── DESIGN TOKENS ───
  const C = {
    navy:    '#0a0f1a',
    dark:    '#0f172a',
    dark2:   '#1e293b',
    teal:    '#0a9e8f',
    tealDk:  '#077a6e',
    tealLt:  '#12c4b2',
    tealBg:  '#e8f9f7',
    white:   '#ffffff',
    cream:   '#faf8f5',
    gray:    '#64748b',
    grayLt:  '#94a3b8',
    grayBdr: '#e2e8f0',
    red:     '#dc2626',
    redBg:   '#fef2f2',
    redDk:   '#991b1b',
    orange:  '#ea580c',
    orangeBg:'#fff7ed',
    green:   '#16a34a',
    greenBg: '#f0fdf4',
    yellow:  '#d97706',
    yellowBg:'#fffbeb',
    purple:  '#7c3aed',
    purpleBg:'#f5f3ff',
  };

  const W = 595.28; // A4 width
  const M = 40;     // margin
  const CW = W - M * 2; // content width

  // ─── DATA EXTRACTION ───
  const patientName = data.name || 'Not Provided';
  const age = data.age || '--';
  const gender = data.gender || '--';
  const email = data.email || '--';
  const dateStr = data.timestamp 
    ? new Date(data.timestamp).toLocaleString('en-IN', { 
        day: '2-digit', month: 'short', year: 'numeric', 
        hour: '2-digit', minute: '2-digit', hour12: true 
      }) 
    : new Date().toLocaleString('en-IN');
  const reportId = `DTN-${data.id || Date.now().toString().slice(-6)}`;

  const chiefComplaint = data.chief_complaint || 'Not specified';
  const location = data.location || 'Not reported';
  const painScale = data.pain_scale || 'Not evaluated';
  const medHistory = data.medical_history || 'No significant systemic diseases reported';
  const allergies = data.allergies || 'No known drug allergies (NKDA)';
  const dentalHistory = data.dental_history || 'No recent dental procedures reported';
  const diagnosis = data.provisional_diagnosis || data.diagnosis || 'Pending clinical examination';
  const urgency = (data.urgency || 'Routine').toUpperCase();
  const investigations = data.investigations || 'Clinical evaluation recommended';
  const treatmentPlan = data.treatment_plan || 'Visit dental clinic for definitive care';
  const medications = data.medications || 'No specific medications suggested — consult dentist';
  const homeRemedies = data.home_remedies || 'Warm saline rinses';
  const dosDonts = data.dos_and_donts || 'Avoid hot/cold/hard foods on affected side';
  const redFlags = data.red_flags || 'Seek emergency care if swelling spreads to eye/neck or high fever develops';

  // ─── HELPER FUNCTIONS ───

  function drawRoundedRect(x, y, w, h, r, fillColor, strokeColor) {
    doc.save();
    if (fillColor) doc.fillColor(fillColor);
    if (strokeColor) doc.strokeColor(strokeColor).lineWidth(0.5);
    doc.roundedRect(x, y, w, h, r);
    if (fillColor && strokeColor) doc.fillAndStroke();
    else if (fillColor) doc.fill();
    else if (strokeColor) doc.stroke();
    doc.restore();
  }

  function sectionHeader(icon, title, y) {
    const startY = y || doc.y;
    
    // Teal accent line on left
    doc.save();
    doc.fillColor(C.teal);
    doc.rect(M, startY, 3, 18).fill();
    doc.restore();

    // Icon circle
    drawRoundedRect(M + 10, startY - 1, 20, 20, 10, C.tealBg, null);
    doc.fontSize(10).text(icon, M + 10, startY + 3, { width: 20, align: 'center' });

    // Title text
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.dark);
    doc.text(title.toUpperCase(), M + 36, startY + 3);
    
    // Subtle line
    doc.save();
    doc.moveTo(M, startY + 24).lineTo(W - M, startY + 24)
       .lineWidth(0.3).strokeColor(C.grayBdr).stroke();
    doc.restore();
    
    doc.y = startY + 32;
  }

  function labelValue(label, value, options = {}) {
    const { bold = false, color = C.dark, valueColor = C.dark2 } = options;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.gray).text(label, M + 8, doc.y, { continued: true });
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(valueColor || color).text('  ' + value);
    doc.moveDown(0.15);
  }

  function infoRow(label, value, x, y, width) {
    doc.font('Helvetica').fontSize(7).fillColor(C.grayLt).text(label, x, y);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.white).text(value, x, y + 10, { width: width || 140 });
  }

  function urgencyConfig(urg) {
    const u = urg.toUpperCase();
    if (u.includes('EMERGENCY')) return { bg: C.redBg, color: C.red, icon: '🚨', label: 'EMERGENCY' };
    if (u.includes('URGENT') || u.includes('SEVERE')) return { bg: C.orangeBg, color: C.orange, icon: '🔴', label: 'URGENT' };
    if (u.includes('MONITOR')) return { bg: C.yellowBg, color: C.yellow, icon: '⚠️', label: 'MONITOR' };
    return { bg: C.greenBg, color: C.green, icon: '✅', label: 'ROUTINE' };
  }

  function checkPageBreak(needed) {
    if (doc.y + needed > 790) {
      doc.addPage();
      doc.y = 40;
    }
  }

  function bulletPoint(text, icon = '•') {
    const startY = doc.y;
    doc.font('Helvetica').fontSize(8.5).fillColor(C.teal).text(icon + ' ', M + 12, startY, { continued: true });
    doc.fillColor(C.dark2).text(text, { lineGap: 2 });
    doc.moveDown(0.1);
  }

  function splitAndBullet(text, icon = '•') {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    lines.forEach(line => {
      // Remove leading emoji/bullet if already present
      const clean = line.replace(/^[✅❌🏠💊📍🔬⚠️•]\s*/, '').trim();
      if (clean) bulletPoint(clean, icon);
    });
  }

  // ═══════════════════════════════════════
  // PAGE 1 — HEADER BAND
  // ═══════════════════════════════════════
  
  // Full-width navy header — 95px
  doc.rect(0, 0, W, 95).fill(C.navy);
  
  // Subtle teal gradient accent at bottom of header
  const grad = doc.linearGradient(0, 90, W, 90);
  grad.stop(0, C.teal).stop(0.5, C.tealLt).stop(1, C.teal);
  doc.rect(0, 92, W, 3).fill(grad);

  // Logo text
  doc.font('Helvetica-Bold').fontSize(22).fillColor(C.teal).text('DATUN', M, 22);
  doc.font('Helvetica-Bold').fontSize(22).fillColor(C.white).text(' AI', M + 80, 22);
  
  // Subtitle
  doc.font('Helvetica').fontSize(8).fillColor(C.grayLt);
  doc.text('AI Dental Triage Report', M, 48);
  doc.font('Helvetica-Bold').fontSize(7).fillColor(C.tealLt);
  doc.text('datunai.com', M, 60);

  // Right side — report meta
  doc.font('Helvetica').fontSize(7.5).fillColor(C.grayLt);
  doc.text('Report ID', W - M - 140, 22, { width: 140, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.white);
  doc.text(reportId, W - M - 140, 32, { width: 140, align: 'right' });
  
  doc.font('Helvetica').fontSize(7).fillColor(C.grayLt);
  doc.text(dateStr, W - M - 140, 48, { width: 140, align: 'right' });
  doc.font('Helvetica').fontSize(7).fillColor(C.tealLt);
  doc.text('Mode: AI Tele-Triage', W - M - 140, 60, { width: 140, align: 'right' });

  doc.y = 108;

  // ═══════════════════════════════════════
  // PATIENT INFORMATION — Dark card
  // ═══════════════════════════════════════
  
  const patY = doc.y;
  drawRoundedRect(M, patY, CW, 60, 8, C.dark, null);
  
  // 4 columns inside card
  const colW = CW / 4;
  infoRow('PATIENT NAME', patientName, M + 14, patY + 10, colW - 20);
  infoRow('AGE / GENDER', `${age} Yrs / ${gender}`, M + colW + 14, patY + 10, colW - 20);
  infoRow('CONTACT', email, M + colW * 2 + 14, patY + 10, colW - 20);
  infoRow('URGENCY', urgencyConfig(urgency).label, M + colW * 3 + 14, patY + 10, colW - 20);

  // Urgency color indicator dot
  const uc = urgencyConfig(urgency);
  doc.circle(M + colW * 3 + 10, patY + 42, 4).fill(uc.color);

  doc.y = patY + 72;

  // ═══════════════════════════════════════
  // CHIEF COMPLAINT & TRIAGE
  // ═══════════════════════════════════════
  
  sectionHeader('🦷', 'Chief Complaint & Triage Data');

  drawRoundedRect(M + 4, doc.y, CW - 8, 24, 6, C.tealBg, null);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.tealDk);
  doc.text(`"${chiefComplaint}"`, M + 12, doc.y + 6, { width: CW - 24 });
  doc.y += 32;

  // Location + Pain Scale + Urgency in a row
  const triageY = doc.y;
  const triW = (CW - 20) / 3;
  
  // Location box
  drawRoundedRect(M + 4, triageY, triW, 36, 5, '#f8fafc', C.grayBdr);
  doc.font('Helvetica').fontSize(7).fillColor(C.gray).text('LOCATION', M + 12, triageY + 5);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.dark).text(location, M + 12, triageY + 17, { width: triW - 16 });

  // Pain Scale box
  drawRoundedRect(M + triW + 10, triageY, triW, 36, 5, '#f8fafc', C.grayBdr);
  doc.font('Helvetica').fontSize(7).fillColor(C.gray).text('PAIN SCALE', M + triW + 18, triageY + 5);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.dark).text(
    painScale.toString().includes('/') ? painScale : `${painScale}/10`, 
    M + triW + 18, triageY + 17, { width: triW - 16 }
  );

  // Urgency box
  drawRoundedRect(M + triW * 2 + 16, triageY, triW, 36, 5, uc.bg, null);
  doc.font('Helvetica').fontSize(7).fillColor(C.gray).text('URGENCY', M + triW * 2 + 24, triageY + 5);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(uc.color).text(
    `${uc.icon} ${uc.label}`, M + triW * 2 + 24, triageY + 17, { width: triW - 16 }
  );

  doc.y = triageY + 46;

  // ═══════════════════════════════════════
  // MEDICAL & DENTAL HISTORY
  // ═══════════════════════════════════════
  
  checkPageBreak(90);
  sectionHeader('📋', 'Medical & Dental History');
  
  labelValue('Systemic Conditions:', medHistory);
  labelValue('Drug Allergies:', allergies, { valueColor: allergies.toLowerCase().includes('no known') ? C.dark2 : C.red });
  labelValue('Past Dental History:', dentalHistory);

  doc.moveDown(0.5);

  // ═══════════════════════════════════════
  // PROVISIONAL DIAGNOSIS
  // ═══════════════════════════════════════
  
  checkPageBreak(70);
  sectionHeader('🩺', 'Provisional Diagnosis');
  
  const diagY = doc.y;
  const finalDiag = location !== 'Not reported' ? `${diagnosis} w.r.t. ${location}` : diagnosis;
  
  drawRoundedRect(M + 4, diagY, CW - 8, 32, 6, C.tealBg, null);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.tealDk);
  doc.text(finalDiag, M + 14, diagY + 9, { width: CW - 28 });
  doc.y = diagY + 42;

  // ═══════════════════════════════════════
  // INVESTIGATIONS
  // ═══════════════════════════════════════
  
  if (investigations && investigations !== 'Not reported') {
    checkPageBreak(60);
    sectionHeader('🔬', 'Investigations Advised');
    
    drawRoundedRect(M + 4, doc.y, CW - 8, 28, 5, C.purpleBg, null);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.purple);
    doc.text(investigations, M + 14, doc.y + 8, { width: CW - 28 });
    doc.y += 36;
  }

  // ═══════════════════════════════════════
  // TREATMENT PLAN
  // ═══════════════════════════════════════
  
  checkPageBreak(60);
  sectionHeader('📍', 'Treatment Pathway');
  splitAndBullet(treatmentPlan, '→');
  doc.moveDown(0.3);

  // ═══════════════════════════════════════
  // MEDICATIONS
  // ═══════════════════════════════════════
  
  checkPageBreak(80);
  sectionHeader('💊', 'Medication Advisory');

  if (medications.toLowerCase().includes('not recommended') || medications.startsWith('OTC_UNSAFE')) {
    drawRoundedRect(M + 4, doc.y, CW - 8, 28, 5, C.yellowBg, null);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.yellow);
    doc.text('⚠️ OTC Not Recommended — ' + medications.replace('OTC_UNSAFE:', '').trim(), M + 14, doc.y + 8, { width: CW - 28 });
    doc.y += 36;
  } else {
    splitAndBullet(medications, '💊');
  }
  doc.moveDown(0.3);

  // ═══════════════════════════════════════
  // HOME CARE — Do's & Don'ts side by side
  // ═══════════════════════════════════════
  
  checkPageBreak(100);
  sectionHeader('🏠', 'Home Care & Remedies');

  // Home remedies
  if (homeRemedies && homeRemedies !== 'Not reported') {
    splitAndBullet(homeRemedies, '🌿');
    doc.moveDown(0.3);
  }

  // Do's & Don'ts
  if (dosDonts && dosDonts !== 'Not reported') {
    const parts = dosDonts.split('\n').map(l => l.trim()).filter(Boolean);
    parts.forEach(line => {
      const isDont = line.startsWith('❌') || line.toLowerCase().includes('don\'t') || line.toLowerCase().includes('avoid');
      const clean = line.replace(/^[✅❌•]\s*/, '').trim();
      if (clean) bulletPoint(clean, isDont ? '❌' : '✅');
    });
  }
  doc.moveDown(0.3);

  // ═══════════════════════════════════════
  // RED FLAGS — Danger zone
  // ═══════════════════════════════════════
  
  checkPageBreak(80);
  sectionHeader('🚨', 'Red Flags — Seek Immediate Care If');

  const rfY = doc.y;
  drawRoundedRect(M + 4, rfY, CW - 8, 4, 0, C.red, null); // red top accent
  drawRoundedRect(M + 4, rfY + 2, CW - 8, 50, 5, C.redBg, null);
  
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.redDk);
  doc.text('⚠️ WARNING — Visit Emergency Room Immediately If:', M + 14, rfY + 10, { width: CW - 28 });
  doc.font('Helvetica').fontSize(8).fillColor(C.dark2);
  doc.text(redFlags, M + 14, doc.y + 3, { width: CW - 28, lineGap: 2 });
  doc.y = Math.max(doc.y + 8, rfY + 58);

  // ═══════════════════════════════════════
  // FOLLOW UP & CTA
  // ═══════════════════════════════════════
  
  checkPageBreak(70);
  doc.moveDown(0.5);
  
  const ctaY = doc.y;
  drawRoundedRect(M, ctaY, CW, 50, 8, C.tealBg, null);
  
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.tealDk);
  doc.text('📞 Connect with Dr. Mayank Vats', M + 14, ctaY + 8);
  
  doc.font('Helvetica').fontSize(8).fillColor(C.dark2);
  doc.text('WhatsApp: +91 99531 35340  ·  Email: hello@datunai.com  ·  Web: datunai.com', M + 14, ctaY + 22, { width: CW - 28 });
  
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.teal);
  doc.text('→ Visit a dental clinic for physical examination and definitive treatment.', M + 14, ctaY + 35, { width: CW - 28 });
  
  doc.y = ctaY + 58;

  // ═══════════════════════════════════════
  // LEGAL DISCLAIMER — Footer area
  // ═══════════════════════════════════════
  
  checkPageBreak(80);
  doc.moveDown(0.8);
  
  // Separator line
  doc.save();
  doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(0.3).strokeColor(C.grayBdr).stroke();
  doc.restore();
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(7).fillColor(C.gray);
  doc.text('TELEMEDICINE GUIDELINES — LEGAL DISCLAIMER', M);
  doc.moveDown(0.2);
  
  doc.font('Helvetica').fontSize(6.5).fillColor(C.grayLt);
  doc.text(
    'This document is a provisional tele-triage summary generated by an AI system (Datun AI) based on user-provided inputs. ' +
    'It DOES NOT constitute a definitive medical/dental diagnosis, a legal medical prescription, or a substitute for professional clinical examination. ' +
    'Under Telemedicine Practice Guidelines (Government of India, 2020), physical examination by a registered medical/dental practitioner is mandatory for definitive diagnosis and treatment. ' +
    'Datun AI and Dr. Mayank Vats assume no liability for clinical decisions or actions taken based solely on this automated triage summary. ' +
    'All medication suggestions are advisory only — always consult a licensed pharmacist or physician before taking any medication.',
    M, doc.y, { width: CW, align: 'justify', lineGap: 1.5 }
  );

  doc.moveDown(0.8);
  
  // Final branding line
  doc.font('Helvetica-Bold').fontSize(7).fillColor(C.teal);
  doc.text('DATUN AI', M, doc.y, { continued: true });
  doc.font('Helvetica').fontSize(7).fillColor(C.grayLt);
  doc.text('  ·  Healthcare is a Right, Not a Privilege  ·  datunai.com  ·  © 2025-2026', { align: 'left' });

  // ═══════════════════════════════════════
  // FINALIZE
  // ═══════════════════════════════════════

  doc.pipe(stream);
  doc.end();
}

module.exports = { generateConsultationPDF };
