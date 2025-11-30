const asyncHandler = require('express-async-handler');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const validator = require('validator');
const { pool } = require('../../configurations/sqlConfig/db');
const { getKenyaTimeISO } = require('../../utilities/timeStamps/timeStamps');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'supersecretrefreshkey';
const RESET_TOKEN = '400453@welttallis';

const failedLogins = {};
const MAX_FAILED = 10;
const BLOCK_TIME = 15 * 60 * 1000;

// 🔧 DB helper
async function safeExecute(sql, params = []) {
  try {
    const [result] = await pool.execute(sql, params);
    return result;
  } catch (err) {
    console.error('❌ MariaDB Error:', err);
    throw err;
  }
}

// 🔒 IP Block check
function isIpBlocked(ip) {
  const record = failedLogins[ip];
  if (!record) return false;

  if (record.count >= MAX_FAILED) {
    const elapsed = Date.now() - record.lastAttempt;
    if (elapsed < BLOCK_TIME) return true;
    delete failedLogins[ip];
  }
  return false;
}

// Generate Access Token
function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, branch_id: user.branch_id },
    JWT_SECRET,
    { expiresIn: '4h' }, // 4 hours
  );
}

// Generate Refresh Token
function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    REFRESH_SECRET,
    { expiresIn: '7d' }, // 7 days
  );
}

// ✅ Get All Users
const getAllUsers = asyncHandler(async (req, res) => {
  try {
    const users = await safeExecute(`
      SELECT 
        u.id, u.name, u.username, u.email, u.role, 
        u.created_at, u.updated_at, u.branch_id, u.is_active,
        b.name as branch_name,
        (SELECT MAX(timestamp) FROM attendance_logs WHERE user_id = u.id AND action = 'login') as last_login
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      ORDER BY u.created_at DESC
    `);

    res.json({
      success: true,
      data: users,
      count: users.length,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
    });
  }
});

// ✅ Register User with branch_id = 1 by default

const registerUser = asyncHandler(async (req, res) => {
  const { name, username, email, role, password } = req.body;

  // Use branch_id = 1 by default
  const branch_id = 1;

  // Validate required fields
  if (!name || !username || !role || !password) {
    return res
      .status(400)
      .json({ success: false, message: 'All fields are required.' });
  }

  // Check if username or email already exists
  const existing = await safeExecute(
    'SELECT 1 FROM users WHERE username = ? OR email = ?',
    [username, email],
  );

  if (existing.length > 0) {
    return res
      .status(400)
      .json({ success: false, message: 'Username or email already exists.' });
  }

  // Hash password and create user
  const hashedPassword = await bcrypt.hash(password, 10);
  const createdAt = getKenyaTimeISO();

  const result = await safeExecute(
    `INSERT INTO users (name, username, email, role, password_hash, branch_id, created_at, updated_at, is_active) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      username,
      email || null,
      role,
      hashedPassword,
      branch_id,
      createdAt,
      createdAt,
      true,
    ],
  );

  res.status(201).json({
    success: true,
    message: 'User registered successfully.',
    data: {
      id: result.insertId,
      name,
      username,
      email,
      role,
      branch_id,
      is_active: true,
    },
  });
});

// ✅ Update User Password - Protect IT Administrators
const updateUserPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  const currentUser = req.user;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters long',
    });
  }

  try {
    // Check if user exists
    const [user] = await safeExecute(
      'SELECT id, role FROM users WHERE id = ?',
      [id],
    );
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Prevent changing IT Administrator passwords
    if (user.role === 'it-administrator') {
      return res.status(403).json({
        success: false,
        message: 'Cannot change password for IT Administrators',
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await safeExecute(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      [hashedPassword, getKenyaTimeISO(), id],
    );

    res.json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update password',
    });
  }
});

// ✅ Toggle User Status - Protect IT Administrators from deactivation
const toggleUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;
  const currentUser = req.user;

  try {
    // Check if user exists
    const [user] = await safeExecute(
      'SELECT id, role, is_active FROM users WHERE id = ?',
      [id],
    );
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Prevent deactivating IT Administrators
    if (user.role === 'it-administrator' && user.is_active && !is_active) {
      return res.status(403).json({
        success: false,
        message: 'Cannot deactivate IT Administrators',
      });
    }

    await safeExecute(
      'UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?',
      [is_active, getKenyaTimeISO(), id],
    );

    res.json({
      success: true,
      message: `User ${is_active ? 'activated' : 'deactivated'} successfully`,
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status',
    });
  }
});

// ✅ Delete User - Protect IT Administrators

const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user;

  if (!currentUser) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const userId = parseInt(id);
  if (isNaN(userId)) {
    return res.status(400).json({ success: false, message: 'Invalid user ID' });
  }

  try {
    const users = await safeExecute('SELECT id, role FROM users WHERE id = ?', [
      userId,
    ]);
    const user = users[0];

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: 'User not found' });
    }

    if (user.role === 'it-administrator') {
      return res
        .status(403)
        .json({ success: false, message: 'Cannot delete IT Administrators' });
    }

    if (user.id === currentUser.id) {
      return res
        .status(403)
        .json({ success: false, message: 'Cannot delete your own account' });
    }

    // Delete user
    await safeExecute('DELETE FROM users WHERE id = ?', [userId]);

    res
      .status(200)
      .json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res
      .status(500)
      .json({
        success: false,
        message: 'Failed to delete user',
        error: error.message,
      });
  }
});

// ✅ Login User
const loginUser = asyncHandler(async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (isIpBlocked(ip)) {
    return res
      .status(429)
      .json({
        success: false,
        message: 'Too many failed attempts. Try again later.',
      });
  }

  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res
      .status(400)
      .json({
        success: false,
        message: 'Username/email and password required.',
      });
  }

  let user;
  if (validator.isEmail(identifier)) {
    user = await safeExecute('SELECT * FROM users WHERE email = ?', [
      identifier,
    ]);
  } else {
    user = await safeExecute('SELECT * FROM users WHERE username = ?', [
      identifier,
    ]);
  }

  if (!user || user.length === 0) {
    failedLogins[ip] = {
      count: (failedLogins[ip]?.count || 0) + 1,
      lastAttempt: Date.now(),
    };
    return res
      .status(401)
      .json({ success: false, message: 'Invalid credentials.' });
  }

  // Check if user is active
  if (!user[0].is_active) {
    return res.status(403).json({
      success: false,
      message: 'Account is deactivated. Please contact administrator.',
    });
  }

  const validPass = await bcrypt.compare(password, user[0].password_hash);
  if (!validPass) {
    failedLogins[ip] = {
      count: (failedLogins[ip]?.count || 0) + 1,
      lastAttempt: Date.now(),
    };
    return res
      .status(401)
      .json({ success: false, message: 'Invalid credentials.' });
  }

  if (failedLogins[ip]) delete failedLogins[ip];

  const now = getKenyaTimeISO();
  await safeExecute(
    "INSERT INTO attendance_logs (user_id, action, timestamp) VALUES (?, 'login', ?)",
    [user[0].id, now],
  );

  const accessToken = generateAccessToken(user[0]);
  const refreshToken = generateRefreshToken(user[0]);

  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 4 * 60 * 60 * 1000, // 4 hours
  });

  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.status(200).json({
    success: true,
    message: 'Login successful.',
    accessToken,
    refreshToken,
    user: {
      id: user[0].id,
      username: user[0].username,
      role: user[0].role,
      branch_id: user[0].branch_id,
      checkin_time: now,
    },
  });
});

// ✅ Logout User
const logoutUser = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res
      .status(400)
      .json({ success: false, message: 'User not authenticated.' });
  }

  // Check if user exists
  const user = await safeExecute('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user || user.length === 0) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const now = getKenyaTimeISO();

  try {
    // Insert logout action
    await safeExecute(
      "INSERT INTO attendance_logs (user_id, action, timestamp) VALUES (?, 'logout', ?)",
      [userId, now],
    );
  } catch (err) {
    console.error('❌ Logout logging failed:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to log logout action.',
    });
  }

  // Clear cookies
  res.clearCookie('access_token', { httpOnly: true, sameSite: 'Strict' });
  res.clearCookie('refresh_token', { httpOnly: true, sameSite: 'Strict' });

  res.json({
    success: true,
    message: 'Logout successful.',
    checkout_time: now,
  });
});

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  getAllUsers,
  updateUserPassword,
  toggleUserStatus,
  deleteUser,
};
