const QRCode = require('qrcode');
const { safeQuery } = require('../../configurations/sqlConfig/db');
const { getKenyaTimeISO } = require('../../utilities/timeStamps/timeStamps');

async function generateQRCodeForDeceased(deceasedId) {
  try {
    console.log(
      '🟡 STEP 1: Starting QR generation for deceased ID:',
      deceasedId,
    );

    // Fetch deceased information from the database
    const deceasedRows = await safeQuery(
      `SELECT * FROM deceased WHERE deceased_id = ?`,
      [deceasedId],
    );

    if (deceasedRows.length === 0) {
      throw new Error('Deceased not found');
    }

    const deceased = deceasedRows[0];

    // Clean and professionally formatted QR code data without icons
    const qrData = `
    Rest Point Deceased QR Code
    ===========================

    Deceased ID: ${deceased.deceased_id}  
    Full Name: ${deceased.full_name}  
    Date of Birth: ${deceased.date_of_birth ? deceased.date_of_birth : 'N/A'}  
    Date of Death: ${deceased.date_of_death ? deceased.date_of_death : 'N/A'}  
    Cause of Death: ${deceased.cause_of_death || 'N/A'}  
    Place of Death: ${deceased.place_of_death || 'N/A'}  
    Gender: ${deceased.gender || 'N/A'}  
    County: ${deceased.county || 'N/A'}  
    Mortuary ID: ${deceased.mortuary_id || 'N/A'}  
    Status: ${deceased.status || 'N/A'}  

    ===========================

    Date Registered: ${deceased.date_registered ? deceased.date_registered : 'N/A'}  
    

    ===========================

    Powered by RestPoint — Your trusted 
    partner in handling deceased records. 

    Contact Support: 
    infowelttallis@gmail.com  
    Location: Nairobi, Kenya  
    Website: welt tallis cooperation
    `;

    console.log('🟡 Generating QR with data:\n', qrData);

    // Generate QR code with the cleaned-up data
    const qrCodeDataURL = await QRCode.toDataURL(qrData, {
      width: 600, // Higher resolution for professional quality
      margin: 4, // More margin for clarity
      errorCorrectionLevel: 'H', // High error correction for better scanning
    });

    // Mark QR code as generated in the database
    const timestamp = getKenyaTimeISO();
    await safeQuery(
      `UPDATE deceased SET qr_code_generated = ?, qr_code_generated_at = ? WHERE deceased_id = ?`,
      [true, timestamp, deceasedId],
    );

    console.log('🟢 QR Code generated and database updated');

    return qrCodeDataURL;
  } catch (error) {
    console.error('❌ ERROR generating QR:', error.message || error);
    throw error;
  }
}

module.exports = { generateQRCodeForDeceased };
