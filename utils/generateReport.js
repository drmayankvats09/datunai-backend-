const PDFDocument = require('pdfkit');

function generateConsultationPDF(data, stream) {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    // ─── Formatting Helpers ───
    const primaryDark = '#0f172a'; // Deep Navy
    const teal = '#0f766e'; // Medical Teal
    const grayText = '#475569';
    const dangerRed = '#b91c1c';

    // ─── Data Extraction & Fallbacks ───
    // NOTE: Make sure your AI output JSON sends these exact keys!
    const patientName = data.name || 'Not Provided';
    const ageGender = `${data.age || '--'} Yrs / ${data.gender || '--'}`;
    const contact = data.email || data.phone || '--';
    const dateStr = data.timestamp ? new Date(data.timestamp).toLocaleString('en-IN') : new Date().toLocaleString('en-IN');
    const reportId = `DTN-${data.id || Date.now().toString().slice(-6)}`;

    const cc = data.chief_complaint || 'Not specified';
    const location = data.location || 'Not specified';
    const painScale = data.pain_scale ? `${data.pain_scale}/10` : 'Not evaluated';
    
    const medHistory = data.medical_history || 'No significant systemic diseases reported (e.g., Diabetes, Hypertension).';
    const allergy = data.allergies || 'No known drug allergies reported.';
    const dentalHistory = data.dental_history || 'No recent extraction/trauma/RCT reported.';
    
    const rawDiagnosis = data.provisional_diagnosis || data.diagnosis || 'Pending clinical examination';
    // Format: Provisional diagnosis wrt Location
    const finalDiagnosis = location !== 'Not specified' ? `${rawDiagnosis} wrt ${location}` : rawDiagnosis;
    const urgency = (data.urgency || 'Routine').toUpperCase();
    
    const investigations = data.investigations || 'Clinical evaluation and Radiograph (IOPA/OPG) of the affected region.';
    const treatmentPlan = data.treatment_plan || 'Symptomatic relief followed by definitive clinical care.';
    const medications = data.medications || 'No specific Rx generated. Consult physically.';
    const homeRemedies = data.home_remedies || 'Warm saline rinses (if no active swelling).';
    const dosDonts = data.dos_and_donts || 'Avoid hot/cold/hard foods. Avoid chewing from affected side.';
    const redFlags = data.red_flags || 'If swelling increases rapidly, spreads to eye/neck, or high fever develops, visit the nearest emergency room immediately.';

    // ─── Section Header Helper ───
    const sectionHeader = (title) => {
        doc.moveDown(1);
        doc.fillColor(teal).font('Helvetica-Bold').fontSize(11).text(title.toUpperCase());
        doc.moveTo(40, doc.y + 2).lineTo(555, doc.y + 2).lineWidth(1).stroke(teal);
        doc.moveDown(0.5);
    };

    // ─── 1. HEADER & BRANDING ───
    doc.rect(0, 0, 595.28, 85).fill(primaryDark);
    doc.fillColor(teal).font('Helvetica-Bold').fontSize(28).text('DATUN AI', 40, 20);
    doc.fillColor('#94a3b8').font('Helvetica-Oblique').fontSize(10).text('Provisional Tele-Triage & Clinical Assessment', 40, 50);
    
    doc.fillColor('#ffffff').font('Helvetica').fontSize(9);
    doc.text(`Mode: Online Triage`, 350, 25, { align: 'right', width: 200 });
    doc.text(`Date: ${dateStr}`, 350, 40, { align: 'right', width: 200 });
    doc.font('Helvetica-Bold').text(`Ref ID: ${reportId}`, 350, 55, { align: 'right', width: 200 });

    doc.y = 100; // Reset Y position for main content

    // ─── 2. PATIENT DETAILS ───
    sectionHeader('Patient Details');
    doc.fillColor(primaryDark).font('Helvetica-Bold').fontSize(9)
       .text(`Name: `, { continued: true }).font('Helvetica').text(patientName);
    doc.font('Helvetica-Bold').text(`Age/Gender: `, { continued: true }).font('Helvetica').text(ageGender);
    doc.font('Helvetica-Bold').text(`Contact: `, { continued: true }).font('Helvetica').text(contact);

    // ─── 3. MEDICAL & DENTAL HISTORY ───
    sectionHeader('Medical & Dental History');
    doc.font('Helvetica-Bold').text(`Systemic Conditions: `, { continued: true }).font('Helvetica').text(medHistory);
    doc.font('Helvetica-Bold').text(`Allergies: `, { continued: true }).font('Helvetica').fillColor(dangerRed).text(allergy).fillColor(primaryDark);
    doc.font('Helvetica-Bold').text(`Past Dental History: `, { continued: true }).font('Helvetica').text(dentalHistory);

    // ─── 4. CHIEF COMPLAINT & SYMPTOMS ───
    sectionHeader('Chief Complaint & Triage Data');
    doc.font('Helvetica-Bold').text(`Reported Symptoms (CC): `);
    doc.font('Helvetica-Oblique').text(`"${cc}"`);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text(`Tooth Area / Location: `, { continued: true }).font('Helvetica').text(location);
    doc.font('Helvetica-Bold').text(`Pain Scale: `, { continued: true }).font('Helvetica').text(painScale);
    doc.font('Helvetica-Bold').text(`Severity / Urgency: `, { continued: true }).font('Helvetica-Bold')
       .fillColor(urgency.includes('EMERGENCY') || urgency.includes('SEVERE') ? dangerRed : teal).text(urgency).fillColor(primaryDark);

    // ─── 5. PROVISIONAL DIAGNOSIS ───
    sectionHeader('Provisional Diagnosis');
    doc.font('Helvetica-Bold').fontSize(11).fillColor(primaryDark).text(finalDiagnosis);

    // ─── 6. INVESTIGATIONS & TREATMENT PLAN (Moved Up!) ───
    sectionHeader('Investigations & Treatment Plan');
    doc.font('Helvetica-Bold').fontSize(9).text(`Suggested Investigations: `);
    doc.font('Helvetica').text(investigations);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text(`Proposed Treatment Plan: `);
    doc.font('Helvetica').text(treatmentPlan);

    // ─── 7. PRESCRIPTION & CARE PLAN ───
    sectionHeader('Provisional Care Plan & Prescription');
    doc.font('Helvetica-Bold').text(`Medications Advisory: `);
    doc.font('Helvetica').text(medications);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text(`Home Remedies: `);
    doc.font('Helvetica').text(homeRemedies);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text(`Dos & Don'ts: `);
    doc.font('Helvetica').text(dosDonts);

    // ─── 8. RED FLAGS & FOLLOW UP ───
    sectionHeader('Red Flags & Next Steps');
    doc.fillColor(dangerRed).font('Helvetica-Bold').text(`⚠️ RED FLAGS (Immediate Attention Required): `);
    doc.font('Helvetica').text(redFlags);
    doc.moveDown(0.5);
    doc.fillColor(primaryDark).font('Helvetica-Bold').text(`Follow-up / Next Step: `, { continued: true })
       .font('Helvetica').text('Visit a dental clinic for physical examination and definitive treatment.');

    // ─── 9. LEGAL DISCLAIMER ───
    doc.moveDown(2);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(0.5).stroke(grayText);
    doc.moveDown(0.5);
    doc.fillColor(grayText).font('Helvetica-Bold').fontSize(8).text('TELEMEDICINE GUIDELINES DISCLAIMER:');
    doc.font('Helvetica').fontSize(7.5).text('This document is a tele-triage summary generated by an AI system based on user-provided inputs. It DOES NOT constitute a definitive medical/dental diagnosis or a legal medical prescription. Under Telemedicine Practice Guidelines, physical examination is required for definitive care. Datun AI assumes no liability for actions taken based solely on this automated triage.', { align: 'justify', lineGap: 1.5 });

    // Finalize
    doc.pipe(stream);
    doc.end();
}

module.exports = { generateConsultationPDF };
