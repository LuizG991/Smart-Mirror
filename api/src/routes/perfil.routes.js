const router = require('express').Router();
const controller = require('../controllers/perfilController');

router.get('/resumo', controller.resumo);
router.get('/aluno', controller.meuPerfilAluno);
router.get('/configuracoes', controller.obterConfiguracoes);
router.put('/configuracoes', controller.salvarConfiguracoes);

module.exports = router;
