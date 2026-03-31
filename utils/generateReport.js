const PDFDocument = require('pdfkit');
function generateConsultationPDF(consultationData, stream) {
    const doc = new PDFDocument({ margin: 50 });
    doc.rect(0, 0, 612, 100).fill('#0a9e8f'); 
    doc.fillColor('#ffffff').fontSize(24).text('DATUN AI', 50, 35);
    doc.fontSize(10).text('India\'s First Free AI Dental Assistant', 50, 65);
    doc.moveDown(4);
    doc.fillColor('#333333').fontSize(14).text('Consultation Report', { underline: true });
    doc.moveDown();
    doc.fontSize(10).fillColor('#666666');
    doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`);
    doc.text(`Patient Name: ${consultationData.name}`);
    doc.text(`Age/Gender: ${consultationData.age} / ${consultationData.gender}`);
    doc.moveDown();
    doc.rect(50, doc.y, 500, 50).stroke('#0a9e8f');
    doc.fillColor('#077a6e').fontSize(12).text('LIKELY DIAGNOSIS:', 60, doc.y + 10);
    doc.fillColor('#000000').text(consultationData.diagnosis || 'General Assessment', 60, doc.y + 5);
    const bottom = doc.page.height - 100;
    doc.fontSize(8).fillColor('#999999').text('Powered by Datun AI | datunai.com', 50, bottom, { align: 'center' });
    doc.text('This is AI guidance, not a prescription. Consult a dentist.', 50, bottom + 15, { align: 'center' });
    doc.pipe(stream);
    doc.end();
}
module.exports = { generateConsultationPDF };
