const router = require('express').Router();
const ctrl = require('../controllers/surahs.controller');

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.get('/:id/ayahs', ctrl.ayahs);

module.exports = router;