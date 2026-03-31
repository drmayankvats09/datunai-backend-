const PDFDocument = require('pdfkit');

function generateConsultationPDF(consultationData, stream) {
    // A4 size document with standard margins
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    
    // Formatting Helpers
    const primaryDark = '#0f172a'; // Deep Navy
    const teal = '#0f766e'; // Medical Teal
    const lightGray = '#f8fafc';
    const borderGray = '#e2e8f0';
    const dangerRed = '#b91c1c';

    // Parse Data Safely
    const patientName = consultationData.name || 'Not Provided';
    const age = consultationData.age || 'N/A';
    const gender = consultationData.gender || 'N/A';
    const email = consultationData.email || 'N/A';
    const cc = consultationData.chief_complaint || 'N/A';
    const diagnosis = consultationData.diagnosis || 'Pending physical examination';
    const urgency = (consultationData.urgency || 'Routine').toUpperCase();
    const dateStr = consultationData.timestamp ? new Date(consultationData.timestamp).toLocaleString('en-IN') : new Date().toLocaleString('en-IN');
    const reportId = `DTN-${consultationData.id || Date.now().toString().slice(-6)}`;

    // Helper function for section headers
    const sectionHeader = (title, yPos) => {
        doc.fillColor(teal).font('Helvetica-Bold').fontSize(11).text(title.toUpperCase(), 40, yPos);
        doc.moveTo(40, yPos + 12).lineTo(555, yPos + 12).lineWidth(1).stroke(teal);
        return yPos + 25;
    };

    // ─── 1. HEADER & BRANDING ───
    doc.rect(0, 0, 595.28, 85).fill(primaryDark);
    doc.fillColor(teal).font('Helvetica-Bold').fontSize(28).text('DATUN AI', 40, 20);
    doc.fillColor('#94a3b8').font('Helvetica-Oblique').fontSize(10).text('AI-Assisted Tele-Triage & Provisional Assessment', 40, 50);
    
    doc.fillColor('#ffffff').font('Helvetica').fontSize(9);
    doc.text(`Consultation Mode: Online Triage`, 350, 25, { align: 'right', width: 200 });
    doc.text(`Date: ${dateStr}`, 350, 40, { align: 'right', width: 200 });
    doc.font('Helvetica-Bold').text(`Ref ID: ${reportId}`, 350, 55, { align: 'right', width: 200 });

    let currentY = 110;

    // ─── 2. PATIENT DEMOGRAPHICS ───
    currentY = sectionHeader('Patient Details', currentY);
    doc.rect(40, currentY, 515, 45).fillAndStroke(lightGray, borderGray);
    
    doc.fillColor(primaryDark).font('Helvetica-Bold').fontSize(9).text('Name:', 50, currentY + 10);
    doc.font('Helvetica').text(patientName, 100, currentY + 10);
    
    doc.font('Helvetica-Bold').text('Age/Gender:', 50, currentY + 25);
    doc.font('Helvetica').text(`${age} Yrs / ${gender}`, 120, currentY + 25);

    doc.font('Helvetica-Bold').text('Contact ID:', 300, currentY + 10);
    doc.font('Helvetica').text(email, 360, currentY + 10);

    // Consent Note
    doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(8).text('✓ Patient consented for AI tele-triage', 300, currentY + 25);

    currentY += 65;

    // ─── 3. CLINICAL TRIAGE & CC ───
    currentY = sectionHeader('Chief Complaint & AI Impression', currentY);
    
    doc.fillColor(primaryDark).font('Helvetica-Bold').fontSize(10).text('Reported Symptoms (CC):', 40, currentY);
    doc.font('Helvetica').fontSize(10).text(`"${cc}"`, 40, currentY + 15, { width: 515, oblique: true });
    
    currentY += 45;
    doc.font('Helvetica-Bold').fontSize(10).text('Provisional AI Impression:', 40, currentY);
    doc.fillColor(teal).font('Helvetica').fontSize(10).text(diagnosis, 40, currentY + 15, { width: 515 });

    currentY += 45;
    // Urgency Tagging
    doc.fillColor(primaryDark).font('Helvetica-Bold').text('Severity / Urgency Level:', 40, currentY);
    
    let urgencyColor = teal;
    if(urgency.includes('EMERGENCY')) urgencyColor = dangerRed;
    else if(urgency.includes('URGENT')) urgencyColor = '#d97706';
    
    doc.rect(170, currentY - 3, 100, 16).fillAndStroke(lightGray, urgencyColor);
    doc.fillColor(urgencyColor).font('Helvetica-Bold').fontSize(9).text(urgency, 170, currentY + 1, { align: 'center', width: 100 });

    currentY += 40;

    // ─── 4. PROVISIONAL GUIDANCE (RX / DOs & DONTs) ───
    currentY = sectionHeader('Provisional Care Plan & Instructions', currentY);

    doc.fillColor(primaryDark).font('Helvetica-Bold').fontSize(10).text('General Instructions:', 40, currentY);
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    doc.text('• Avoid chewing from the affected side.', 40, currentY + 15);
    doc.text('• Maintain soft diet; avoid extreme hot, cold, or hard foods.', 40, currentY + 28);
    doc.text('• Maintain gentle oral hygiene. Warm saline rinses recommended (if no active swelling).', 40, currentY + 41);

    currentY += 65;
    
    // Medications Note
    doc.fillColor(primaryDark).font('Helvetica-Bold').fontSize(10).text('Medication Advisory:', 40, currentY);
    doc.rect(40, currentY + 15, 515, 35).fillAndStroke('#fffbeb', '#fcd34d');
    doc.fillColor('#92400e').font('Helvetica').fontSize(8.5).text(
        'As this is an AI-assisted triage, specific prescription drugs (Antibiotics/Strong Analgesics) require verification of your complete medical history, allergies, and physical examination by a registered dental practitioner. Do not self-medicate.', 
        45, currentY + 20, { width: 505, align: 'justify' }
    );

    currentY += 65;

    // ─── 5. RED FLAGS & INVESTIGATIONS ───
    currentY = sectionHeader('Red Flags & Follow-up', currentY);
    
    // Red Flags
    doc.rect(40, currentY, 515, 45).fillAndStroke('#fef2f2', dangerRed);
    doc.fillColor(dangerRed).font('Helvetica-Bold').fontSize(9).text('⚠️ IMMEDIATE ATTENTION REQUIRED IF:', 50, currentY + 8);
    doc.font('Helvetica').text('Swelling increases rapidly, spreads to eye/neck, difficulty in swallowing/breathing, or high fever develops. Visit the nearest emergency room immediately.', 50, currentY + 20, { width: 495 });

    currentY += 55;
    
    // Investigations & Plan
    doc.fillColor(primaryDark).font('Helvetica-Bold').fontSize(10).text('Suggested Investigations:', 40, currentY);
    doc.font('Helvetica').fontSize(9).text('Clinical evaluation and likely Radiograph (IOPA/OPG) of the affected region.', 180, currentY);

    currentY += 20;
    doc.font('Helvetica-Bold').fontSize(10).text('Next Step:', 40, currentY);
    doc.fillColor(teal).text('Visit a dental clinic for physical examination and definitive treatment plan.', 180, currentY);

    // ─── 6. FOOTER & LEGAL DISCLAIMER ───
    const bottomY = doc.page.height - 100;
    
    doc.moveTo(40, bottomY).lineTo(555, bottomY).lineWidth(0.5).stroke(borderGray);
    
    doc.fillColor(primaryDark).font('Helvetica-Bold').fontSize(8).text('TELEMEDICINE & LEGAL DISCLAIMER:', 40, bottomY + 10);
    doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text(
        'This document is a provisional tele-triage summary generated by an AI system based on user-provided inputs. It DOES NOT constitute a definitive medical/dental diagnosis or a legal medical prescription. Under Telemedicine Practice Guidelines, physical examination is required for definitive care. Datun AI and its creators assume no liability for actions taken based solely on this automated triage. If in doubt, consult a registered medical/dental practitioner.', 
        40, bottomY + 22, { width: 515, align: 'justify', lineGap: 1.5 }
    );

    doc.fillColor(primaryDark).font('Helvetica-Bold').fontSize(8).text('Generated securely by Datun AI | datunai.com | Support: hello@datunai.com', 40, bottomY + 70, { align: 'center' });

    // Finalize the PDF and end the stream
    doc.pipe(stream);
    doc.end();
}

module.exports = { generateConsultationPDF };
