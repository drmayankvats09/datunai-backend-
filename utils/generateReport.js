const PDFDocument = require('pdfkit');

function generateConsultationPDF(data, stream) {
  const doc = new PDFDocument({ 
    size: 'A4', 
    margins: { top: 0, bottom: 40, left: 40, right: 40 },
    bufferPages: true,
    info: {
      Title: 'Datun AI - Dental Report #DTN-' + (data.id || '000'),
      Author: 'Datun AI by Dr. Mayank Vats',
      Subject: 'AI Dental Triage Report',
      Creator: 'datunai.com'
    }
  });

  // ─── COLORS ───
  var navy    = '#0a0f1a';
  var dark    = '#0f172a';
  var dark2   = '#1e293b';
  var teal    = '#0a9e8f';
  var tealDk  = '#077a6e';
  var tealLt  = '#12c4b2';
  var tealBg  = '#e8f9f7';
  var white   = '#ffffff';
  var gray    = '#64748b';
  var grayLt  = '#94a3b8';
  var grayBdr = '#e2e8f0';
  var red     = '#dc2626';
  var redBg   = '#fef2f2';
  var redDk   = '#991b1b';
  var orange  = '#ea580c';
  var orangeBg= '#fff7ed';
  var green   = '#16a34a';
  var greenBg = '#f0fdf4';
  var greenDk = '#065f46';
  var yellow  = '#d97706';
  var yellowBg= '#fffbeb';
  var purple  = '#7c3aed';
  var purpleBg= '#f5f3ff';

  var W  = 595.28;
  var M  = 40;
  var CW = W - M * 2;

  // ─── DATA ───
  var patientName  = data.name || 'Not Provided';
  var age          = data.age || '--';
  var gender       = data.gender || '--';
  var email        = data.email || '--';
  var dateStr      = data.timestamp 
    ? new Date(data.timestamp).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true }) 
    : new Date().toLocaleString('en-IN');
  var reportId     = 'DTN-' + (data.id || Date.now().toString().slice(-6));
  var complaint    = data.chief_complaint || 'Not specified';
  var location     = data.location || 'Not reported';
  var painScale    = data.pain_scale || 'Not evaluated';
  var medHistory   = data.medical_history || 'No significant systemic diseases reported';
  var allergies    = data.allergies || 'No known drug allergies (NKDA)';
  var dentalHist   = data.dental_history || 'No recent dental procedures reported';
  var diagnosis    = data.provisional_diagnosis || data.diagnosis || 'Pending clinical examination';
  var urgency      = (data.urgency || 'Routine').toUpperCase();
  var investigations = data.investigations || 'Clinical evaluation recommended';
  var treatmentPlan= data.treatment_plan || 'Visit dental clinic for definitive care';
  var medications  = data.medications || 'No specific medications suggested';
  var homeRemedies = data.home_remedies || 'Warm saline rinses';
  var dosDonts     = data.dos_and_donts || 'Avoid hot/cold/hard foods on affected side';
  var redFlags     = data.red_flags || 'Seek emergency care if swelling spreads';

  // ─── HELPERS ───
  function checkPage(needed) {
    if (doc.y + needed > 760) {
      doc.addPage();
      doc.y = 40;
    }
  }

  function urgencyInfo(u) {
    u = u.toUpperCase();
    if (u.includes('EMERGENCY')) return { bg: redBg, color: red, label: 'EMERGENCY' };
    if (u.includes('URGENT') || u.includes('SEVERE')) return { bg: orangeBg, color: orange, label: 'URGENT' };
    if (u.includes('MONITOR')) return { bg: yellowBg, color: yellow, label: 'MONITOR' };
    return { bg: greenBg, color: green, label: 'ROUTINE' };
  }

  function sectionTitle(title) {
    checkPage(40);
    doc.moveDown(0.6);
    // Teal left bar
    doc.rect(M, doc.y, 3, 16).fill(teal);
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(dark);
    doc.text(title.toUpperCase(), M + 10, doc.y + 2, { width: CW - 10 });
    // Underline
    doc.moveTo(M, doc.y + 4).lineTo(W - M, doc.y + 4).lineWidth(0.3).strokeColor(grayBdr).stroke();
    doc.moveDown(0.5);
  }

  function labelVal(label, value, valColor) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(gray);
    doc.text(label, M + 8, doc.y, { continued: true });
    doc.font('Helvetica').fontSize(8.5).fillColor(valColor || dark2);
    doc.text('  ' + value);
    doc.moveDown(0.1);
  }

  function bulletLine(text, color, bullet) {
    var clean = text.replace(/^[✅❌🏠💊📍🔬⚠️•→]\s*/, '').trim();
    if (!clean) return;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(color || teal);
    doc.text((bullet || '>') + '  ', M + 10, doc.y, { continued: true });
    doc.font('Helvetica').fontSize(8.5).fillColor(dark2);
    doc.text(clean, { lineGap: 1.5 });
    doc.moveDown(0.05);
  }

  var uc = urgencyInfo(urgency);

  // ═══════════════════════════════════════
  // HEADER — Navy band with teal accent
  // ═══════════════════════════════════════
  
  doc.rect(0, 0, W, 88).fill(navy);
  doc.rect(0, 88, W, 3).fill(teal);

  // Left — Brand
  doc.font('Helvetica-Bold').fontSize(22).fillColor(teal).text('DATUN', M, 20);
  doc.font('Helvetica-Bold').fontSize(22).fillColor(white).text('AI', M + 78, 20);
  doc.font('Helvetica').fontSize(8).fillColor(grayLt).text('AI Dental Triage Report', M, 46);
  doc.font('Helvetica-Bold').fontSize(7).fillColor(tealLt).text('datunai.com', M, 58);
  doc.font('Helvetica').fontSize(6.5).fillColor(grayLt).text('By Dr. Mayank Vats, BDS', M, 70);

  // Right — Report meta
  doc.font('Helvetica').fontSize(7).fillColor(grayLt).text('Report ID', W - M - 150, 20, { width: 150, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(white).text(reportId, W - M - 150, 31, { width: 150, align: 'right' });
  doc.font('Helvetica').fontSize(7).fillColor(grayLt).text(dateStr, W - M - 150, 48, { width: 150, align: 'right' });
  doc.font('Helvetica').fontSize(7).fillColor(tealLt).text('Mode: AI Tele-Triage', W - M - 150, 60, { width: 150, align: 'right' });

  doc.y = 102;

  // ═══════════════════════════════════════
  // PATIENT INFO — Dark card with 4 columns
  // ═══════════════════════════════════════
  
  var patY = doc.y;
  doc.roundedRect(M, patY, CW, 55, 6).fill(dark);

  var col = CW / 4;

  // Col 1 — Name
  doc.font('Helvetica').fontSize(6.5).fillColor(grayLt).text('PATIENT', M + 12, patY + 8);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(white).text(patientName, M + 12, patY + 20, { width: col - 16 });

  // Col 2 — Age/Gender
  doc.font('Helvetica').fontSize(6.5).fillColor(grayLt).text('AGE / GENDER', M + col + 12, patY + 8);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(white).text(age + ' / ' + gender, M + col + 12, patY + 20, { width: col - 16 });

  // Col 3 — Contact
  doc.font('Helvetica').fontSize(6.5).fillColor(grayLt).text('CONTACT', M + col * 2 + 12, patY + 8);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(white).text(email, M + col * 2 + 12, patY + 20, { width: col - 16 });

  // Col 4 — Urgency
  doc.font('Helvetica').fontSize(6.5).fillColor(grayLt).text('URGENCY', M + col * 3 + 12, patY + 8);
  // Urgency badge
  doc.roundedRect(M + col * 3 + 12, patY + 19, 70, 18, 4).fill(uc.color);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(white).text(uc.label, M + col * 3 + 14, patY + 23, { width: 66, align: 'center' });

  doc.y = patY + 66;

  // ═══════════════════════════════════════
  // CHIEF COMPLAINT
  // ═══════════════════════════════════════
  
  sectionTitle('Chief Complaint');
  doc.roundedRect(M + 4, doc.y, CW - 8, 22, 4).fill(tealBg);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(tealDk);
  doc.text('"' + complaint + '"', M + 12, doc.y + 5, { width: CW - 24 });
  doc.y += 30;

  // ─── Triage row: Location | Pain | Urgency ───
  var triY = doc.y;
  var triW = Math.floor((CW - 16) / 3);

  doc.roundedRect(M + 2, triY, triW, 32, 4).lineWidth(0.5).strokeColor(grayBdr).stroke();
  doc.font('Helvetica').fontSize(6.5).fillColor(gray).text('LOCATION', M + 10, triY + 4);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(dark).text(location, M + 10, triY + 15, { width: triW - 16 });

  doc.roundedRect(M + triW + 8, triY, triW, 32, 4).lineWidth(0.5).strokeColor(grayBdr).stroke();
  doc.font('Helvetica').fontSize(6.5).fillColor(gray).text('PAIN SCALE', M + triW + 16, triY + 4);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(dark).text(String(painScale).includes('/') ? painScale : painScale + '/10', M + triW + 16, triY + 15, { width: triW - 16 });

  doc.roundedRect(M + triW * 2 + 14, triY, triW, 32, 4).fill(uc.bg);
  doc.font('Helvetica').fontSize(6.5).fillColor(gray).text('SEVERITY', M + triW * 2 + 22, triY + 4);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(uc.color).text(uc.label, M + triW * 2 + 22, triY + 15, { width: triW - 16 });

  doc.y = triY + 42;

  // ═══════════════════════════════════════
  // MEDICAL & DENTAL HISTORY
  // ═══════════════════════════════════════
  
  sectionTitle('Medical & Dental History');
  labelVal('Systemic Conditions:', medHistory);
  labelVal('Drug Allergies:', allergies, allergies.toLowerCase().includes('no known') ? dark2 : red);
  labelVal('Past Dental History:', dentalHist);
  doc.moveDown(0.2);

  // ═══════════════════════════════════════
  // PROVISIONAL DIAGNOSIS
  // ═══════════════════════════════════════
  
  sectionTitle('Provisional Diagnosis');
  var finalDiag = location !== 'Not reported' ? diagnosis + ' w.r.t. ' + location : diagnosis;
  doc.roundedRect(M + 4, doc.y, CW - 8, 26, 4).fill(tealBg);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(tealDk);
  doc.text(finalDiag, M + 12, doc.y + 7, { width: CW - 24 });
  doc.y += 34;

  // ═══════════════════════════════════════
  // INVESTIGATIONS
  // ═══════════════════════════════════════
  
  if (investigations && investigations !== 'Not reported' && investigations !== 'Clinical evaluation recommended') {
    sectionTitle('Investigations Advised');
    doc.roundedRect(M + 4, doc.y, CW - 8, 22, 4).fill(purpleBg);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(purple);
    doc.text(investigations, M + 12, doc.y + 5, { width: CW - 24 });
    doc.y += 30;
  }

  // ═══════════════════════════════════════
  // TREATMENT PLAN
  // ═══════════════════════════════════════
  
  checkPage(60);
  sectionTitle('Treatment Plan');
  var tpLines = treatmentPlan.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);
  tpLines.forEach(function(line) {
    var clean = line.replace(/^[📍→•]\s*/, '').trim();
    if (clean) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(teal).text('> ', M + 10, doc.y, { continued: true });
      doc.font('Helvetica').fontSize(8.5).fillColor(dark2).text(clean, { lineGap: 1.5 });
      doc.moveDown(0.05);
    }
  });
  doc.moveDown(0.2);

  // ═══════════════════════════════════════
  // MEDICATIONS — Highlighted teal bg
  // ═══════════════════════════════════════
  
  checkPage(80);
  sectionTitle('Medications');

  if (medications.toLowerCase().includes('not recommended') || medications.startsWith('OTC_UNSAFE')) {
    doc.roundedRect(M + 4, doc.y, CW - 8, 24, 4).fill(yellowBg);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(yellow);
    doc.text('! OTC Not Recommended - ' + medications.replace('OTC_UNSAFE:', '').trim(), M + 12, doc.y + 6, { width: CW - 24 });
    doc.y += 32;
  } else {
    // Teal background box for medications
    var medLines = medications.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);
    var medBoxH = medLines.length * 16 + 12;
    checkPage(medBoxH + 10);
    doc.roundedRect(M + 4, doc.y, CW - 8, medBoxH, 4).fill(tealBg);
    var medStartY = doc.y + 6;
    medLines.forEach(function(line, i) {
      var clean = line.replace(/^[💊•]\s*/, '').trim();
      if (clean) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(tealDk);
        doc.text('Rx  ', M + 12, medStartY + (i * 16), { continued: true });
        doc.font('Helvetica').fontSize(8.5).fillColor(dark2).text(clean);
      }
    });
    doc.y += medBoxH + 6;
  }
  doc.moveDown(0.2);

  // ═══════════════════════════════════════
  // HOME REMEDIES — Warm yellow bg
  // ═══════════════════════════════════════
  
  if (homeRemedies && homeRemedies !== 'Not reported') {
    checkPage(60);
    sectionTitle('Home Remedies');
    var hrLines = homeRemedies.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);
    var hrBoxH = hrLines.length * 16 + 12;
    checkPage(hrBoxH + 10);
    doc.roundedRect(M + 4, doc.y, CW - 8, hrBoxH, 4).fill(yellowBg);
    var hrStartY = doc.y + 6;
    hrLines.forEach(function(line, i) {
      var clean = line.replace(/^[🏠🌿•]\s*/, '').trim();
      if (clean) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(yellow);
        doc.text('*  ', M + 12, hrStartY + (i * 16), { continued: true });
        doc.font('Helvetica').fontSize(8.5).fillColor(dark2).text(clean);
      }
    });
    doc.y += hrBoxH + 6;
  }
  doc.moveDown(0.2);

  // ═══════════════════════════════════════
  // DO'S (GREEN) & DON'TS (RED) — Side by side
  // ═══════════════════════════════════════
  
  checkPage(80);
  sectionTitle("Do's & Don'ts");

  var dos = [];
  var donts = [];
  var ddLines = dosDonts.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);
  
  ddLines.forEach(function(line) {
    var clean = line.replace(/^[✅❌•]\s*/, '').trim();
    if (!clean) return;
    if (line.startsWith('❌') || line.toLowerCase().includes("don't") || line.toLowerCase().includes('avoid') || line.toLowerCase().includes('do not') || line.toLowerCase().includes('na kare') || line.toLowerCase().includes('mat ')) {
      donts.push(clean);
    } else {
      dos.push(clean);
    }
  });

  // If no clear split, put first half as do's and second as don'ts
  if (dos.length === 0 && donts.length === 0 && ddLines.length > 0) {
    ddLines.forEach(function(line) {
      dos.push(line.replace(/^[✅❌•]\s*/, '').trim());
    });
  }

  var halfW = Math.floor((CW - 12) / 2);
  var maxRows = Math.max(dos.length, donts.length);
  var ddBoxH = maxRows * 16 + 28;
  checkPage(ddBoxH + 10);

  var ddY = doc.y;

  // DO's column — Green
  doc.roundedRect(M + 2, ddY, halfW, ddBoxH, 4).fill(greenBg);
  doc.rect(M + 2, ddY, halfW, 18).fill(green);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(white).text("DO's", M + 12, ddY + 4, { width: halfW - 20 });
  dos.forEach(function(item, i) {
    doc.font('Helvetica').fontSize(8).fillColor(greenDk);
    doc.text('> ' + item, M + 10, ddY + 24 + (i * 16), { width: halfW - 16 });
  });

  // DON'Ts column — Red
  doc.roundedRect(M + halfW + 10, ddY, halfW, ddBoxH, 4).fill(redBg);
  doc.rect(M + halfW + 10, ddY, halfW, 18).fill(red);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(white).text("DON'Ts", M + halfW + 20, ddY + 4, { width: halfW - 20 });
  donts.forEach(function(item, i) {
    doc.font('Helvetica').fontSize(8).fillColor(redDk);
    doc.text('> ' + item, M + halfW + 18, ddY + 24 + (i * 16), { width: halfW - 16 });
  });

  doc.y = ddY + ddBoxH + 8;

  // ═══════════════════════════════════════
  // CONNECT WITH DOCTOR — CTA card
  // ═══════════════════════════════════════
  
  checkPage(55);
  doc.moveDown(0.3);
  var ctaY = doc.y;
  doc.roundedRect(M, ctaY, CW, 46, 6).fill(tealBg);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(tealDk).text('Connect with Dr. Mayank Vats', M + 12, ctaY + 8);
  doc.font('Helvetica').fontSize(8).fillColor(dark2).text('WhatsApp: +91 99531 35340   |   Email: hello@datunai.com   |   Web: datunai.com', M + 12, ctaY + 22, { width: CW - 24 });
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(teal).text('Visit a dental clinic for physical examination and definitive treatment.', M + 12, ctaY + 34, { width: CW - 24 });
  doc.y = ctaY + 54;

  // ═══════════════════════════════════════
  // DISCLAIMER — Bottom of page
  // ═══════════════════════════════════════
  
  checkPage(100);
  doc.moveDown(1);

  // Separator
  doc.moveTo(M, doc.y).lineTo(W - M, doc.y).lineWidth(0.3).strokeColor(grayBdr).stroke();
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(gray).text('TELEMEDICINE GUIDELINES — LEGAL DISCLAIMER', M, doc.y, { width: CW, align: 'center' });
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(6).fillColor(grayLt);
  doc.text(
    'This document is a provisional tele-triage summary generated by an AI system (Datun AI) based on user-provided inputs. ' +
    'It DOES NOT constitute a definitive medical/dental diagnosis, a legal medical prescription, or a substitute for professional clinical examination. ' +
    'Under Telemedicine Practice Guidelines (Government of India, 2020), physical examination by a registered medical/dental practitioner is mandatory for definitive diagnosis and treatment. ' +
    'Datun AI and Dr. Mayank Vats assume no liability for clinical decisions or actions taken based solely on this automated triage summary. ' +
    'All medication suggestions are advisory only — always consult a licensed pharmacist or physician before taking any medication.',
    M, doc.y, { width: CW, align: 'center', lineGap: 1.5 }
  );

  // ═══════════════════════════════════════
  // BRANDING — Centered at very bottom
  // ═══════════════════════════════════════
  
  doc.moveDown(1.5);
  doc.moveTo(M + 60, doc.y).lineTo(W - M - 60, doc.y).lineWidth(0.3).strokeColor(teal).stroke();
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(teal).text('DATUN AI', M, doc.y, { width: CW, align: 'center', continued: true });
  doc.font('Helvetica').fontSize(7).fillColor(grayLt).text('  |  Healthcare is a Right, Not a Privilege  |  datunai.com', { align: 'center' });
  doc.moveDown(0.2);
  doc.font('Helvetica').fontSize(6).fillColor(grayLt).text('© 2025-2026 Datun AI Private Limited  |  New Delhi, India', M, doc.y, { width: CW, align: 'center' });

  // ═══════════════════════════════════════
  // FINALIZE
  // ═══════════════════════════════════════

  doc.pipe(stream);
  doc.end();
}

module.exports = { generateConsultationPDF };
