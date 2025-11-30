const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  logoutUser,

  getAllUsers,
  updateUserPassword,
  toggleUserStatus,
  deleteUser,
} = require('../controllers/users/usersControl');

// ✅ Authentication Routes
router.post('/users/register', registerUser);
router.post('/login', loginUser);

router.post('/logout', logoutUser);

// ✅ Worker Management Routes
router.get('/users', getAllUsers); // Get all users
router.put('/users/:id/password', updateUserPassword); // Change password
router.put('/users/:id/status', toggleUserStatus); // Toggle active/inactive
router.delete('/users/:id', deleteUser); // Delete user

module.exports = router;
