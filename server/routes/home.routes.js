const router = require('express').Router();
const ctrl = require('../controllers/home.controller');
const { optionalAuth } = require('../middleware/auth');

router.get('/', optionalAuth, ctrl.get);

module.exports = router;