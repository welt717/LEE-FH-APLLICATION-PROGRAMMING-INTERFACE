const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const { safeQuery } = require('../../configurations/sqlConfig/db');

// Validation rules
const validateUser = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('role').isIn(['admin', 'staff', 'viewer']).withMessage('Invalid role'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
];

// Controller function
async function registerUser(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { name, email, role, password, created_at } = req.body;

  // Only allow superadmin to proceed
  if (req.user?.role !== 'superadmin') {
    return res
      .status(403)
      .json({ success: false, message: 'Only superadmin can register users.' });
  }

  try {
    // Check if email already exists
    const existing = await safeQuery('SELECT id FROM users WHERE email = ?', [
      email,
    ]);
    if (existing.length > 0) {
      return res
        .status(409)
        .json({ success: false, message: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await safeQuery(
      `INSERT INTO users (name, email, role, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [name, email, role, passwordHash, created_at],
    );

    return res
      .status(201)
      .json({ success: true, message: 'User registered successfully.' });
  } catch (error) {
    console.error('❌ Registration Error:', error.message);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { registerUser, validateUser };
