const router = require('express').Router();
const ctrl = require('../controllers/tracks.controller');

router.get('/', ctrl.list);
router.get('/search', ctrl.search);
router.get('/:id', ctrl.getOne);

module.exports = router;