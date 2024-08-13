const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');

// Authentication routes
router.post('/add', serviceController.newBatch);
router.get('/list', serviceController.list);

module.exports = router;