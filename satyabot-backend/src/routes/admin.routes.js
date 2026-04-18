const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

router.get('/trending', adminController.getTrending.bind(adminController));

router.get('/stats', adminController.getStats.bind(adminController));

router.get('/clusters', adminController.getClusters.bind(adminController));

router.get('/heatmap', adminController.getHeatmap.bind(adminController));

module.exports = router;