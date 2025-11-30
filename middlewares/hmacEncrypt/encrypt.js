// middleware/hmacAuth.js
const crypto = require('crypto');

const SECRETKEY = 'tech4kids@2025@welttallis@restpoint';

async function verifyHmacKeys(req, res, next) {
  try {
    // headers are always lowercased in Node.js
    const clientSignature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];

    if (!clientSignature || !timestamp) {
      return res.status(401).json({
        success: false,
        message: '❌ Missing Software Signature. Contact Developer.',
      });
    }

    // prevent replay attacks (allow only 5 minutes old requests)
    const now = Date.now();
    if (Math.abs(now - parseInt(timestamp)) > 5 * 60 * 1000) {
      return res.status(401).json({
        success: false,
        message: '❌ Request expired. Please retry.',
      });
    }

    // create payload string
    const payload =
      req.method + req.originalUrl + JSON.stringify(req.body || {}) + timestamp;

    // generate server-side signature
    const serverSignature = crypto
      .createHmac('sha256', SECRETKEY)
      .update(payload)
      .digest('hex');

    // compare client vs server signature
    if (serverSignature !== clientSignature) {
      return res.status(403).json({
        success: false,
        message: '❌ Invalid Software Signature.',
      });
    }

    // ✅ passed
    next();
  } catch (error) {
    console.error('HMAC verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal HMAC verification error',
    });
  }
}

module.exports = verifyHmacKeys;
