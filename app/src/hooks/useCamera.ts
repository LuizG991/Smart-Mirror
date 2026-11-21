import { useCallback, useEffect, useRef, useState } from "react";
import {
  EstadoAluno,
  EstadoCamera,
  ligarAluno,
  pararAluno,
  resolverAlertaCamera,
  statusCamera,
} from "../services/aovivo";

// Consulta o servidor da câmera (estado dos 3 alunos) e expõe ligar/parar/resolver por aluno.
export function useCamera(intervaloMs = 1000) {
  const [estado, setEstado] = useState<EstadoCamera | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState<number | null>(null); // aluno em ação
  const vivo = useRef(true);

  const atualizar = useCallback(async () => {
    try {
      const e = await statusCamera();
      if (!vivo.current) return;
      setEstado(e);
      setErro("");
    } catch (e: any) {
      if (vivo.current) setErro(e.message);
    }
  }, []);

  useEffect(() => {
    vivo.current = true;
    atualizar();
    const t = setInterval(atualizar, intervaloMs);
    return () => {
      vivo.current = false;
      clearInterval(t);
    };
  }, [atualizar, intervaloMs]);

  const executar = useCallback(
    async (n: number, acao: () => Promise<EstadoAluno>) => {
      setOcupado(n);
      try {
        const novo = await acao();
        if (!vivo.current) return;
        setEstado((prev) =>
          prev ? { alunos: { ...prev.alunos, [String(n)]: novo } } : prev,
        );
        setErro("");
      } catch (e: any) {
        if (vivo.current) setErro(e.message);
      } finally {
        if (vivo.current) setOcupado(null);
      }
    },
    [],
  );

  const ligar = useCallback(
    (n: number) => executar(n, () => ligarAluno(n)),
    [executar],
  );
  const parar = useCallback(
    (n: number) => executar(n, () => pararAluno(n)),
    [executar],
  );

  const resolver = useCallback(
    async (id: number) => {
      try {
        await resolverAlertaCamera(id);
        await atualizar();
      } catch (e: any) {
        if (vivo.current) setErro(e.message);
      }
    },
    [atualizar],
  );

  return { estado, erro, ocupado, ligar, parar, resolver };
}
