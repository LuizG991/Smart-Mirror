const router = require('express').Router();
const controller = require('../controllers/alertasController');

router.get('/', controller.listar);
router.post('/', controller.criar);
router.patch('/:id/resolver', controller.resolver);

module.exports = router;