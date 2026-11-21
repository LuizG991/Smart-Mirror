import { meuPerfilAluno } from "../services/api";
import { usePolling } from "./usePolling";

// Dados do aluno logado (personal, plano, vaga de monitoramento...)
export function useMeuPerfil() {
  const { dados, loading, error, recarregar } = usePolling(meuPerfilAluno, 15000);
  return { perfil: dados, loading, error, recarregar };
}
