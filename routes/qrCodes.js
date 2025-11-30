const express = require('express');
const router = express.Router();
const { generateQRCodeForDeceased } = require('../controllers/qrCodes/qrCode');
router.get('/qr-code/:deceasedId', async (req, res) => {
  const { deceasedId } = req.params;

  console.log({
    message: '🔄 Received request to generate QR',
    deceasedId,
  });

  try {
    const qrCode = await generateQRCodeForDeceased(deceasedId);
    console.log('✅ QR code generated');
    res.json({ success: true, qrCode });
  } catch (error) {
    console.error('❌ Error generating QR:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
