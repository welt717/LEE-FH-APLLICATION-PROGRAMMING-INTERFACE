const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'supersecretrefreshkey';

// Helper to create access token
function createAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '4h' });
}

// Helper to create refresh token
function createRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });
}

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    // If no access token, check refresh token in cookies
    if (!token) {
      const refreshToken = req.cookies?.refresh_token;
      if (!refreshToken)
        return res.status(401).json({ message: 'No token provided' });

      try {
        const decodedRefresh = jwt.verify(refreshToken, REFRESH_SECRET);
        // Issue new access token
        token = createAccessToken({
          id: decodedRefresh.id,
          role: decodedRefresh.role,
          branch_id: decodedRefresh.branch_id,
        });
        res.setHeader('x-access-token', token); // send new token in header
        req.user = decodedRefresh;
        return next();
      } catch (err) {
        return res
          .status(403)
          .json({ message: 'Refresh token expired, please login again' });
      }
    }

    // Verify access token
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
}

module.exports = {
  authMiddleware,
  createAccessToken,
  createRefreshToken,
};
