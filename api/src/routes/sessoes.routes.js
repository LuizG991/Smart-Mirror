const router = require('express').Router();
const controller = require('../controllers/sessoesController');


router.get('/', controller.listar);
router.get('/hoje', controller.hoje);
router.get('/:id/monitoramento', controller.monitoramento);

module.exports = router;