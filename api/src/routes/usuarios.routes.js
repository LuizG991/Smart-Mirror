const router = require('express').Router();
const controller = require('../controllers/usuariosController');

router.get('/', controller.listar);

module.exports = router;