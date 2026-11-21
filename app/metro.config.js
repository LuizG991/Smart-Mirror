// Configuração padrão do Expo. A única mudança: permite dependências opcionais (require dentro
// de try/catch). O seletor de vídeos do celular (expo-document-picker) é carregado assim, para
// o app abrir normalmente mesmo antes de o pacote ser instalado.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.transformer.allowOptionalDependencies = true;

module.exports = config;
