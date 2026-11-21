import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import PainelAoVivo from "../components/PainelAoVivo";
import { ICheck, IDanger, IWarn } from "../components/Icons";
import { EstadoAluno } from "../services/aovivo";
import { colors, fonts } from "../theme";

// Tela de UM aluno dentro da aba Monitorar: aqui se ativa/desativa o monitoramento.
export default function MonitorAluno({
  numero,
  titulo,
  tituloPainel,
  estado,
  erro,
  ocupado,
  onLigar,
  onParar,
  onResolver,
  onVoltar,
}: {
  numero: number;
  estado: EstadoAluno | null;
  erro: string;
  ocupado: boolean;
  onLigar: () => void;
  onParar: () => void;
  onResolver: (id: number) => void;
  onVoltar?: () => void; // sem isso, não mostra o botão de voltar
  titulo?: string; // padrão: "Aluno N"
  tituloPainel?: string;
}) {
  const alertas = estado?.alertas ?? [];
  const pendentes = alertas.filter((a) => !a.resolvido);
  const resolvidos = alertas.filter((a) => a.resolvido).slice(0, 3);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        {onVoltar && (
          <TouchableOpacity style={styles.backBtn} onPress={onVoltar}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.title}>{titulo ?? `Aluno ${numero}`}</Text>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: estado?.ligado
                ? "rgba(48,209,88,0.12)"
                : colors.secondary,
            },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              { color: estado?.ligado ? colors.ok : colors.secondaryForeground },
            ]}
          >
            {estado?.ligado ? "AO VIVO" : "DESLIGADO"}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <PainelAoVivo
          titulo={tituloPainel}
          numero={numero}
          estado={estado}
          erro={erro}
          ocupado={ocupado}
          onLigar={onLigar}
          onParar={onParar}
        />

        {pendentes.map((a) => {
          const perigo = a.severidade === "danger";
          const cor = perigo ? colors.primary : colors.warn;
          return (
            <View
              key={a.id}
              style={[
                styles.card,
                {
                  backgroundColor: perigo
                    ? "rgba(217,28,28,0.10)"
                    : "rgba(255,159,10,0.10)",
                  borderColor: perigo
                    ? "rgba(217,28,28,0.35)"
                    : "rgba(255,159,10,0.35)",
                },
              ]}
            >
              <View style={styles.alertaTopo}>
                {perigo ? (
                  <IDanger size={16} color={cor} />
                ) : (
                  <IWarn size={16} color={cor} />
                )}
                <Text style={[styles.alertaTitulo, { color: cor }]}>
                  {a.titulo_erro}
                </Text>
              </View>
              <Text style={styles.alertaCorpo}>
                {[a.detalhes_sensor, a.risco_lesao].filter(Boolean).join(" ")}
              </Text>
              <TouchableOpacity
                onPress={() => onResolver(a.id)}
                style={[styles.resolveBtn, { backgroundColor: cor }]}
              >
                <ICheck size={16} color="#fff" />
                <Text style={styles.resolveBtnText}>Marcar como Resolvido</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {resolvidos.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Alertas resolvidos recentes</Text>
            <View style={{ gap: 10 }}>
              {resolvidos.map((a) => (
                <View key={a.id} style={styles.resolvidoLinha}>
                  <ICheck size={14} color={colors.ok} />
                  <Text style={styles.resolvidoTexto}>
                    {a.titulo_erro} · {a.exercicio}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { color: colors.foreground, fontSize: 18, fontWeight: "700" },
  title: {
    color: colors.foreground,
    fontFamily: fonts.display,
    fontSize: 16,
    flex: 1,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  card: {
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 20,
    padding: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  alertaTopo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  alertaTitulo: { fontSize: 14, fontWeight: "700", flex: 1 },
  alertaCorpo: { color: colors.secondaryForeground, fontSize: 12, lineHeight: 18 },
  resolveBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 16,
  },
  resolveBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  resolvidoLinha: { flexDirection: "row", alignItems: "center", gap: 8 },
  resolvidoTexto: { color: colors.foreground, fontSize: 13, flex: 1 },
});
