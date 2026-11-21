const router = require('express').Router();
const controller = require('../controllers/alunosController');

router.get('/', controller.listar);
router.get('/disponiveis', controller.disponiveis);
router.post('/', controller.vincular);
router.put('/:id/vaga', controller.definirVaga);

module.exports = router;
