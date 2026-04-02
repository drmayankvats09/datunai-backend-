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

  var navy='#0a0f1a',dark='#0f172a',dark2='#1e293b';
  var teal='#0a9e8f',tealDk='#077a6e',tealLt='#12c4b2',tealBg='#e8f9f7';
  var white='#ffffff',gray='#64748b',grayLt='#94a3b8',grayBdr='#e2e8f0';
  var red='#dc2626',redBg='#fef2f2',redDk='#991b1b';
  var orange='#ea580c',orangeBg='#fff7ed';
  var green='#16a34a',greenBg='#f0fdf4',greenDk='#065f46';
  var yellow='#d97706',yellowBg='#fffbeb';
  var purple='#7c3aed',purpleBg='#f5f3ff';

  var W=595.28,M=40,CW=W-M*2;

  // ─── HELPERS ───
  function cap(str){
    if(!str)return'';
    return str.split('\n').map(function(line){
      return line.trim().replace(/^(.)/, function(m){return m.toUpperCase();});
    }).join('\n');
  }

  function toPoints(str){
    if(!str)return[];
    var items=[];
    var lines=str.split('\n').map(function(l){return l.trim();}).filter(Boolean);
    lines.forEach(function(line){
      var parts=line.split(/[,;]/).map(function(p){return p.trim();}).filter(Boolean);
      if(parts.length>1&&line.indexOf('\n')===-1){
        parts.forEach(function(p){
          var clean=p.replace(/^[✅❌🏠💊📍🔬⚠️•→>*Rx\s]+/,'').trim();
          if(clean)items.push(cap(clean));
        });
      }else{
        var clean=line.replace(/^[✅❌🏠💊📍🔬⚠️•→>*Rx\s]+/,'').trim();
        if(clean)items.push(cap(clean));
      }
    });
    return items;
  }

  function checkPage(needed){
    if(doc.y+needed>750){doc.addPage();doc.y=40;}
  }

  function urgencyInfo(u){
    u=(u||'').toUpperCase();
    if(u.includes('EMERGENCY'))return{bg:redBg,color:red,label:'EMERGENCY'};
    if(u.includes('URGENT')||u.includes('SEVERE'))return{bg:orangeBg,color:orange,label:'URGENT'};
    if(u.includes('MONITOR'))return{bg:yellowBg,color:yellow,label:'MONITOR'};
    return{bg:greenBg,color:green,label:'ROUTINE'};
  }

  function sectionTitle(title){
    checkPage(35);
    doc.moveDown(0.5);
    doc.rect(M,doc.y,3,14).fill(teal);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(dark);
    doc.text(title.toUpperCase(),M+10,doc.y+1,{width:CW-10});
    doc.moveTo(M,doc.y+3).lineTo(W-M,doc.y+3).lineWidth(0.3).strokeColor(grayBdr).stroke();
    doc.moveDown(0.4);
  }

  function drawBulletList(items, bulletColor, textColor, bgColor){
    if(!items||!items.length)return;
    var boxH=items.length*18+10;
    checkPage(boxH+5);
    var startY=doc.y;
    doc.roundedRect(M+4,startY,CW-8,boxH,4).fill(bgColor||'#f8fafc');
    items.forEach(function(item,i){
      doc.font('Helvetica-Bold').fontSize(8).fillColor(bulletColor||teal);
      doc.text('> ',M+12,startY+6+(i*18),{continued:true});
      doc.font('Helvetica').fontSize(8.5).fillColor(textColor||dark2);
      doc.text(item,{width:CW-40});
    });
    doc.y=startY+boxH+4;
  }

  // ─── DATA ───
  var patientName=cap(data.name||'Not Provided');
  var age=data.age||'--';
  var gender=cap(data.gender||'--');
  var email=data.email||'--';
  var dateStr=data.timestamp?new Date(data.timestamp).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}):new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
  var reportId='DTN-'+(data.id||Date.now().toString().slice(-6));
  var complaint=cap(data.chief_complaint||'Not Specified');
  var location=cap(data.location||'Not Reported');
  var painScale=data.pain_scale||'Not Evaluated';
  var medHistory=cap(data.medical_history||'No Significant Systemic Diseases Reported');
  var allergies=cap(data.allergies||'No Known Drug Allergies (NKDA)');
  var dentalHist=cap(data.dental_history||'No Recent Dental Procedures Reported');
  var diagnosis=cap(data.provisional_diagnosis||data.diagnosis||'Pending Clinical Examination');
  var urgency=(data.urgency||'Routine').toUpperCase();
  var investigations=cap(data.investigations||'');
  var treatmentPlan=data.treatment_plan||'';
  var medications=data.medications||'';
  var homeRemedies=data.home_remedies||'';
  var dosDonts=data.dos_and_donts||'';
  var uc=urgencyInfo(urgency);

  // ═══════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════
  doc.rect(0,0,W,88).fill(navy);
  doc.rect(0,88,W,3).fill(teal);

  doc.font('Helvetica-Bold').fontSize(22).fillColor(teal).text('DATUN',M,20);
  doc.font('Helvetica-Bold').fontSize(22).fillColor(white).text('AI',M+78,20);
  doc.font('Helvetica').fontSize(8).fillColor(grayLt).text('AI Dental Triage Report',M,46);
  doc.font('Helvetica-Bold').fontSize(7).fillColor(tealLt).text('datunai.com',M,58);
  doc.font('Helvetica').fontSize(6.5).fillColor(grayLt).text('By Dr. Mayank Vats, BDS',M,70);

  doc.font('Helvetica').fontSize(7).fillColor(grayLt).text('Report ID',W-M-150,20,{width:150,align:'right'});
  doc.font('Helvetica-Bold').fontSize(11).fillColor(white).text(reportId,W-M-150,31,{width:150,align:'right'});
  doc.font('Helvetica').fontSize(7).fillColor(grayLt).text(dateStr,W-M-150,48,{width:150,align:'right'});
  doc.font('Helvetica').fontSize(7).fillColor(tealLt).text('Mode: AI Tele-Triage',W-M-150,60,{width:150,align:'right'});

  doc.y=102;

  // ═══════════════════════════════════════
  // PATIENT INFO CARD
  // ═══════════════════════════════════════
  var patY=doc.y;
  doc.roundedRect(M,patY,CW,55,6).fill(dark);
  var col=CW/4;

  doc.font('Helvetica').fontSize(6.5).fillColor(grayLt).text('PATIENT',M+12,patY+8);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(white).text(patientName,M+12,patY+20,{width:col-16});

  doc.font('Helvetica').fontSize(6.5).fillColor(grayLt).text('AGE / GENDER',M+col+12,patY+8);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(white).text(age+' Yrs / '+gender,M+col+12,patY+20,{width:col-16});

  doc.font('Helvetica').fontSize(6.5).fillColor(grayLt).text('CONTACT',M+col*2+12,patY+8);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(white).text(email,M+col*2+12,patY+20,{width:col-16});

  doc.font('Helvetica').fontSize(6.5).fillColor(grayLt).text('URGENCY',M+col*3+12,patY+8);
  doc.roundedRect(M+col*3+12,patY+19,70,18,4).fill(uc.color);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(white).text(uc.label,M+col*3+14,patY+23,{width:66,align:'center'});

  doc.y=patY+66;

  // ═══════════════════════════════════════
  // CHIEF COMPLAINT
  // ═══════════════════════════════════════
  sectionTitle('Chief Complaint');
  doc.roundedRect(M+4,doc.y,CW-8,22,4).fill(tealBg);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(tealDk);
  doc.text('"'+complaint+'"',M+12,doc.y+5,{width:CW-24});
  doc.y+=30;

  // Triage row
  var triY=doc.y;
  var triW=Math.floor((CW-16)/3);

  doc.roundedRect(M+2,triY,triW,34,4).lineWidth(0.5).strokeColor(grayBdr).stroke();
  doc.font('Helvetica').fontSize(6.5).fillColor(gray).text('LOCATION',M+10,triY+4);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(dark).text(location,M+10,triY+16,{width:triW-16});

  doc.roundedRect(M+triW+8,triY,triW,34,4).lineWidth(0.5).strokeColor(grayBdr).stroke();
  doc.font('Helvetica').fontSize(6.5).fillColor(gray).text('PAIN SCALE',M+triW+16,triY+4);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(dark).text(String(painScale).includes('/')?cap(String(painScale)):painScale+'/10',M+triW+16,triY+16,{width:triW-16});

  doc.roundedRect(M+triW*2+14,triY,triW,34,4).fill(uc.bg);
  doc.font('Helvetica').fontSize(6.5).fillColor(gray).text('SEVERITY',M+triW*2+22,triY+4);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(uc.color).text(uc.label,M+triW*2+22,triY+16,{width:triW-16});

  doc.y=triY+44;

  // ═══════════════════════════════════════
  // MEDICAL HISTORY
  // ═══════════════════════════════════════
  sectionTitle('Medical & Dental History');
  doc.font('Helvetica-Bold').fontSize(8).fillColor(gray).text('Systemic Conditions:  ',M+8,doc.y,{continued:true});
  doc.font('Helvetica').fontSize(8.5).fillColor(dark2).text(medHistory);doc.moveDown(0.1);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(gray).text('Drug Allergies:  ',M+8,doc.y,{continued:true});
  doc.font('Helvetica').fontSize(8.5).fillColor(allergies.toLowerCase().includes('no known')?dark2:red).text(allergies);doc.moveDown(0.1);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(gray).text('Dental History:  ',M+8,doc.y,{continued:true});
  doc.font('Helvetica').fontSize(8.5).fillColor(dark2).text(dentalHist);
  doc.moveDown(0.2);

  // ═══════════════════════════════════════
  // PROVISIONAL DIAGNOSIS
  // ═══════════════════════════════════════
  sectionTitle('Provisional Diagnosis');
  var finalDiag=location!=='Not Reported'?diagnosis+' w.r.t. '+location:diagnosis;
  doc.roundedRect(M+4,doc.y,CW-8,26,4).fill(tealBg);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(tealDk);
  doc.text(finalDiag,M+12,doc.y+7,{width:CW-28});
  doc.y+=34;

  // ═══════════════════════════════════════
  // INVESTIGATIONS
  // ═══════════════════════════════════════
  if(investigations&&investigations!=='Not Reported'&&investigations!==''){
    sectionTitle('Investigations Advised');
    doc.roundedRect(M+4,doc.y,CW-8,22,4).fill(purpleBg);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(purple);
    doc.text(cap(investigations),M+12,doc.y+5,{width:CW-24});
    doc.y+=30;
  }

  // ═══════════════════════════════════════
  // TREATMENT PLAN
  // ═══════════════════════════════════════
  if(treatmentPlan){
    var tpItems=toPoints(treatmentPlan);
    if(tpItems.length){
      sectionTitle('Treatment Plan');
      drawBulletList(tpItems,teal,dark2,tealBg);
      doc.moveDown(0.2);
    }
  }

  // ═══════════════════════════════════════
  // MEDICATIONS
  // ═══════════════════════════════════════
  if(medications){
    checkPage(60);
    sectionTitle('Medications');
    if(medications.toLowerCase().includes('not recommended')||medications.startsWith('OTC_UNSAFE')){
      doc.roundedRect(M+4,doc.y,CW-8,24,4).fill(yellowBg);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(yellow);
      doc.text('! OTC Not Recommended - '+medications.replace('OTC_UNSAFE:','').trim(),M+12,doc.y+6,{width:CW-24});
      doc.y+=32;
    }else{
      var medItems=toPoints(medications);
      if(medItems.length){
        var medBoxH=medItems.length*18+10;
        checkPage(medBoxH+5);
        var medY=doc.y;
        doc.roundedRect(M+4,medY,CW-8,medBoxH,4).fill(tealBg);
        medItems.forEach(function(item,i){
          doc.font('Helvetica-Bold').fontSize(8).fillColor(tealDk);
          doc.text('Rx  ',M+12,medY+6+(i*18),{continued:true});
          doc.font('Helvetica').fontSize(8.5).fillColor(dark2);
          doc.text(item,{width:CW-50});
        });
        doc.y=medY+medBoxH+4;
      }
    }
    doc.moveDown(0.2);
  }

  // ═══════════════════════════════════════
  // HOME REMEDIES
  // ═══════════════════════════════════════
  if(homeRemedies){
    var hrItems=toPoints(homeRemedies);
    if(hrItems.length){
      sectionTitle('Home Remedies');
      var hrBoxH=hrItems.length*18+10;
      checkPage(hrBoxH+5);
      var hrY=doc.y;
      doc.roundedRect(M+4,hrY,CW-8,hrBoxH,4).fill(yellowBg);
      hrItems.forEach(function(item,i){
        doc.font('Helvetica-Bold').fontSize(8).fillColor(yellow);
        doc.text('*  ',M+12,hrY+6+(i*18),{continued:true});
        doc.font('Helvetica').fontSize(8.5).fillColor(dark2);
        doc.text(item,{width:CW-50});
      });
      doc.y=hrY+hrBoxH+4;
      doc.moveDown(0.2);
    }
  }

  // ═══════════════════════════════════════
  // DO'S (GREEN) & DON'TS (RED)
  // ═══════════════════════════════════════
  var dos=[];
  var donts=[];
  var ddLines=(dosDonts||'').split('\n').map(function(l){return l.trim();}).filter(Boolean);
  
  ddLines.forEach(function(line){
    var clean=line.replace(/^[✅❌•>*]\s*/,'').trim();
    if(!clean)return;
    if(line.indexOf('❌')===0||clean.toLowerCase().indexOf('avoid')===0||clean.toLowerCase().indexOf("don't")===0||clean.toLowerCase().indexOf('do not')===0||clean.toLowerCase().indexOf('na kare')!==-1||clean.toLowerCase().indexOf('mat ')!==-1||clean.toLowerCase().indexOf('nahi')!==-1||clean.toLowerCase().indexOf('na kha')!==-1||clean.toLowerCase().indexOf('kabhi')!==-1){
      donts.push(cap(clean));
    }else{
      dos.push(cap(clean));
    }
  });

  if(dos.length||donts.length){
    sectionTitle("Do's & Don'ts");
    var halfW=Math.floor((CW-12)/2);
    var maxRows=Math.max(dos.length,donts.length,1);
    var rowH=20;
    var ddBoxH=maxRows*rowH+28;
    checkPage(ddBoxH+10);
    var ddY=doc.y;

    // DO's — Green column
    doc.roundedRect(M+2,ddY,halfW,ddBoxH,4).fill(greenBg);
    doc.roundedRect(M+2,ddY,halfW,20,4).fill(green);
    doc.rect(M+2,ddY+16,halfW,4).fill(green);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(white).text("WHAT TO DO",M+12,ddY+5,{width:halfW-20});
    dos.forEach(function(item,i){
      doc.font('Helvetica').fontSize(8).fillColor(greenDk);
      doc.text('> '+item,M+10,ddY+26+(i*rowH),{width:halfW-16});
    });
    if(!dos.length){
      doc.font('Helvetica').fontSize(8).fillColor(gray);
      doc.text('No specific instructions',M+10,ddY+26,{width:halfW-16});
    }

    // DON'Ts — Red column
    doc.roundedRect(M+halfW+10,ddY,halfW,ddBoxH,4).fill(redBg);
    doc.roundedRect(M+halfW+10,ddY,halfW,20,4).fill(red);
    doc.rect(M+halfW+10,ddY+16,halfW,4).fill(red);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(white).text("WHAT NOT TO DO",M+halfW+20,ddY+5,{width:halfW-20});
    donts.forEach(function(item,i){
      doc.font('Helvetica').fontSize(8).fillColor(redDk);
      doc.text('> '+item,M+halfW+18,ddY+26+(i*rowH),{width:halfW-16});
    });
    if(!donts.length){
      doc.font('Helvetica').fontSize(8).fillColor(gray);
      doc.text('No specific restrictions',M+halfW+18,ddY+26,{width:halfW-16});
    }

    doc.y=ddY+ddBoxH+8;
  }

  // ═══════════════════════════════════════
  // CONNECT CTA
  // ═══════════════════════════════════════
  checkPage(55);
  doc.moveDown(0.3);
  var ctaY=doc.y;
  doc.roundedRect(M,ctaY,CW,46,6).fill(tealBg);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(tealDk).text('Connect with Dr. Mayank Vats',M+12,ctaY+8);
  doc.font('Helvetica').fontSize(8).fillColor(dark2).text('WhatsApp: +91 99531 35340   |   Email: hello@datunai.com   |   Web: datunai.com',M+12,ctaY+22,{width:CW-24});
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(teal).text('Visit a dental clinic for physical examination and definitive treatment.',M+12,ctaY+34,{width:CW-24});
  doc.y=ctaY+54;

  // ═══════════════════════════════════════
  // DISCLAIMER + BRANDING — Always at bottom
  // ═══════════════════════════════════════
  checkPage(120);
  
  // Push to bottom area
  if(doc.y<710)doc.y=710;
  
  doc.moveTo(M,doc.y).lineTo(W-M,doc.y).lineWidth(0.3).strokeColor(grayBdr).stroke();
  doc.moveDown(0.4);

  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(gray).text('TELEMEDICINE GUIDELINES — LEGAL DISCLAIMER',M,doc.y,{width:CW,align:'center'});
  doc.moveDown(0.25);
  doc.font('Helvetica').fontSize(6).fillColor(grayLt);
  doc.text(
    'This document is a provisional tele-triage summary generated by an AI system (Datun AI) based on user-provided inputs. '+
    'It DOES NOT constitute a definitive medical/dental diagnosis, a legal medical prescription, or a substitute for professional clinical examination. '+
    'Under Telemedicine Practice Guidelines (Government of India, 2020), physical examination by a registered medical/dental practitioner is mandatory for definitive diagnosis and treatment. '+
    'Datun AI and Dr. Mayank Vats assume no liability for clinical decisions or actions taken based solely on this automated triage summary. '+
    'All medication suggestions are advisory only — always consult a licensed pharmacist or physician before taking any medication.',
    M,doc.y,{width:CW,align:'center',lineGap:1.5}
  );

  doc.moveDown(1.2);
  doc.moveTo(M+80,doc.y).lineTo(W-M-80,doc.y).lineWidth(0.5).strokeColor(teal).stroke();
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(teal).text('DATUN AI',M,doc.y,{width:CW,align:'center'});
  doc.moveDown(0.15);
  doc.font('Helvetica').fontSize(7).fillColor(gray).text('Healthcare is a Right, Not a Privilege',M,doc.y,{width:CW,align:'center'});
  doc.moveDown(0.15);
  doc.font('Helvetica').fontSize(6.5).fillColor(grayLt).text('datunai.com  |  New Delhi, India  |  © 2025-2026 Datun AI Private Limited',M,doc.y,{width:CW,align:'center'});

  doc.pipe(stream);
  doc.end();
}

module.exports = { generateConsultationPDF };
