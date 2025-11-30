const express = require('express');
const router = express.Router();
const { assignColdRoom } = require('../controllers/coldroom/coldroom');

router.post('/assign/cold-room', assignColdRoom);

module.exports = router;
