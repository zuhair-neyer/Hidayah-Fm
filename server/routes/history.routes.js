const wrap = require('../utils/async');
const router = require('express').Router();
const ctrl = require('../controllers/history.controller');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', wrap(ctrl.list));
router.post('/', wrap(ctrl.add));
router.delete('/',wrap(ctrl.clear));
router.post('/progress',wrap(ctrl.progress));
router.get('/stats',wrap(ctrl.stats));

module.exports = router;
