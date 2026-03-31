const PDFDocument = require('pdfkit');

/**
 * Generates a branded PDF consultation report using PDFKit.
 * @param {Object} consultationData - The data retrieved from the database.
 * @param {Object} stream - The HTTP response stream to pipe the PDF into.
 */
function generateConsultationPDF(consultationData, stream) {
    const doc = new PDFDocument({ margin: 50 });

    // 1. Generate Header with Brand Colors
    doc.rect(0, 0, 612, 100).fill('#0a9e8f'); 
    doc.fillColor('#ffffff')
       .fontSize(24)
       .text('DATUN AI', 50, 35);
    doc.fontSize(10)
       .text('India\'s First Free AI Dental Assistant', 50, 65);

    // 2. Generate Patient Information Section
    doc.moveDown(4);
    doc.fillColor('#333333')
       .fontSize(14)
       .text('Consultation Report', { underline: true });
    doc.moveDown();
    doc.fontSize(10).fillColor('#666666');
    
    const reportDate = consultationData.timestamp 
        ? new Date(consultationData.timestamp).toLocaleDateString('en-IN') 
        : new Date().toLocaleDateString('en-IN');

    doc.text(`Date: ${reportDate}`);
    doc.text(`Patient Name: ${consultationData.name || 'Not Provided'}`);
    doc.text(`Age/Gender: ${consultationData.age || 'N/A'} / ${consultationData.gender || 'N/A'}`);

    // 3. Generate Diagnosis & Urgency Box
    doc.moveDown();
    doc.rect(50, doc.y, 500, 55).stroke('#0a9e8f');
    doc.fillColor('#077a6e')
       .fontSize(12)
       .text('DIAGNOSIS & URGENCY:', 60, doc.y + 10);
    
    const diagnosisText = consultationData.diagnosis || 'General Assessment';
    const urgencyText = consultationData.urgency ? `[${consultationData.urgency.toUpperCase()}]` : '';
    
    doc.fillColor('#000000')
       .fontSize(10)
       .text(`${urgencyText} ${diagnosisText}`, 60, doc.y + 5, { width: 480 });

    // 4. Generate Footer with Legal Disclaimer
    const bottomPosition = doc.page.height - 80;
    doc.fontSize(8)
       .fillColor('#999999')
       .text('Powered by Datun AI | datunai.com', 50, bottomPosition, { align: 'center' });
    doc.text('DISCLAIMER: This is AI-generated guidance, not a medical prescription. Please consult a licensed dentist.', 50, bottomPosition + 15, { align: 'center' });

    // Finalize and pipe to response
    doc.pipe(stream);
    doc.end();
}

module.exports = { generateConsultationPDF };
