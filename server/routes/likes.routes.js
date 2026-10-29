const wrap = require('../utils/async');
const router = require('express').Router();
const ctrl = require('../controllers/likes.controller');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', wrap(ctrl.list));
router.post('/toggle', wrap(ctrl.toggle));

module.exports = router;