import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useCamera } from "../hooks/useCamera";
import { colors } from "../theme";
import MonitorAluno from "./MonitorAluno";

// Aba Monitorar do ALUNO: ele liga e desliga o PRÓPRIO monitoramento (auto-monitoramento).
// Se o personal já colocou o aluno numa vaga (Aluno 1, 2 ou 3), usa essa vaga e o personal
// vê a análise ao vivo; sem vaga, usa a vaga 0 (auto-monitoramento) do servidor da câmera.
export default function AlunoMonitor({
  vaga,
  carregando,
  erroPerfil,
}: {
  vaga: number | null;
  carregando: boolean;
  erroPerfil?: string;
}) {
  const { estado, erro, ocupado, ligar, parar, resolver } = useCamera(1000);

  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const slot = vaga ?? 0;
  return (
    <View style={{ flex: 1 }}>
      {!!erroPerfil && <Text style={styles.aviso}>{erroPerfil}</Text>}
      <MonitorAluno
        numero={slot}
        titulo="Meu monitoramento"
        tituloPainel="Meu auto-monitoramento"
        estado={estado?.alunos[String(slot)] ?? null}
        erro={erro}
        ocupado={ocupado === slot}
        onLigar={() => ligar(slot)}
        onParar={() => parar(slot)}
        onResolver={resolver}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: "center", justifyContent: "center" },
  aviso: { color: colors.warn, fontSize: 12, paddingHorizontal: 20, paddingTop: 12 },
});
