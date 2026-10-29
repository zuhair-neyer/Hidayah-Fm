const wrap = require('../utils/async');
const router = require('express').Router();
const ctrl = require('../controllers/playlists.controller');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', wrap(ctrl.list));
router.post('/', wrap(ctrl.create));
router.get('/:id', wrap(ctrl.getOne));
router.patch('/:id', wrap(ctrl.update));
router.delete('/:id', wrap(ctrl.remove));
router.post('/:id/items', wrap(ctrl.addItem));
router.put('/:id/order', wrap(ctrl.reorder));
router.delete('/:id/items/:entryId', wrap(ctrl.removeItem));

module.exports = router;
