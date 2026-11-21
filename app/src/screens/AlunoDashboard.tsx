import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { IBell, ICheck, IRun } from "../components/Icons";
import { isSemBanco, PerfilAluno } from "../services/api";
import { formatarNome } from "../format";
import { colors, fonts } from "../theme";
import { AlertItem, Screen, SessaoHoje } from "../types";

const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Início do ALUNO: o treino dele, os alertas dele e o atalho para se auto-monitorar.
export default function AlunoDashboard({
  userName,
  perfil,
  alerts,
  sessoes,
  onNav,
}: {
  userName: string;
  perfil: PerfilAluno | null;
  alerts: AlertItem[];
  sessoes: SessaoHoje[];
  onNav: (s: Screen) => void;
}) {
  const pendentes = alerts.filter((a) => !a.resolved);
  const agora = new Date();
  const dataTexto = `${DIAS[agora.getDay()]}, ${agora.getDate()} ${MESES[agora.getMonth()]}`;
  const nome = formatarNome(userName).split(" ")[0] || "";
  const visitante = isSemBanco();

  return (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.dateText}>{dataTexto}</Text>
          <Text style={styles.hello}>Olá, {nome} 👋</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{nome.charAt(0)}</Text>
        </View>
      </View>

      <TouchableOpacity onPress={() => onNav("monitor")} style={styles.banner}>
        <View style={styles.dot} />
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>Auto-monitoramento</Text>
          <Text style={styles.bannerSub}>
            Ligue a câmera e receba correções do seu treino
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      <View style={styles.statsRow}>
        {[
          { label: "Treinos hoje", value: sessoes.length, color: colors.foreground },
          { label: "Alertas", value: pendentes.length, color: pendentes.length ? colors.primary : colors.foreground },
          { label: "Sessões", value: perfil?.total_sessoes ?? 0, color: colors.foreground },
        ].map((c) => (
          <View key={c.label} style={styles.statCard}>
            <Text style={[styles.statValue, { color: c.color }]}>{c.value}</Text>
            <Text style={styles.statLabel}>{c.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Meu personal</Text>
        {visitante ? (
          <Text style={styles.sub}>
            Visitantes não têm personal vinculado. Para ter um personal
            acompanhando seus treinos, crie uma conta de aluno — enquanto
            isso, o auto-monitoramento já funciona.
          </Text>
        ) : perfil?.personal_nome ? (
          <>
            <Text style={styles.personal}>{formatarNome(perfil.personal_nome)}</Text>
            <Text style={styles.sub}>
              {perfil.personal_cref ? `CREF ${perfil.personal_cref} · ` : ""}
              {perfil.objetivo ? `Objetivo: ${perfil.objetivo}` : "Objetivo não definido"}
            </Text>
          </>
        ) : (
          <Text style={styles.sub}>
            Você ainda não está vinculado a um personal. Peça para ele te
            adicionar pelo e-mail da sua conta — enquanto isso, o
            auto-monitoramento já funciona.
          </Text>
        )}
      </View>

      {pendentes.length > 0 && (
        <TouchableOpacity onPress={() => onNav("alerts")} style={styles.alertBanner}>
          <View style={styles.alertIcon}>
            <IBell size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.alertTitle}>
              {pendentes.length} correção{pendentes.length > 1 ? "ões" : ""} pendente
              {pendentes.length > 1 ? "s" : ""}
            </Text>
            <Text style={styles.sub}>{pendentes[0].error}</Text>
          </View>
          <Text style={[styles.chevron, { color: colors.primary }]}>›</Text>
        </TouchableOpacity>
      )}

      <View style={styles.sessionsCard}>
        <View style={styles.sessionsHeader}>
          <Text style={styles.cardLabel}>Meus treinos de hoje</Text>
        </View>
        {sessoes.length === 0 && (
          <Text style={[styles.sub, { padding: 16, paddingTop: 4 }]}>
            Nenhum treino agendado para hoje.
          </Text>
        )}
        {sessoes.map((s, i) => (
          <View
            key={s.id}
            style={[styles.sessionRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
          >
            <View
              style={[
                styles.sessionIcon,
                { backgroundColor: s.done ? "rgba(48,209,88,0.12)" : colors.secondary },
              ]}
            >
              {s.done ? (
                <ICheck size={16} color={colors.ok} />
              ) : (
                <IRun size={16} color={colors.mutedForeground} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sessionName}>{s.exercise}</Text>
              <Text style={styles.sub}>{s.done ? "Concluído" : "Em andamento / agendado"}</Text>
            </View>
            <Text style={[styles.sessionTime, { color: s.done ? colors.ok : colors.secondaryForeground }]}>
              {s.time}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dateText: { color: colors.mutedForeground, fontSize: 12 },
  hello: { color: colors.foreground, fontFamily: fonts.display, fontSize: 18 },
  avatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontFamily: fonts.display, fontSize: 14 },
  banner: { marginHorizontal: 20, marginBottom: 12, borderRadius: 20, padding: 16, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, backgroundColor: "rgba(48,209,88,0.08)", borderColor: "rgba(48,209,88,0.25)" },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ok },
  bannerTitle: { color: colors.ok, fontSize: 14, fontWeight: "600" },
  bannerSub: { color: colors.secondaryForeground, fontSize: 12, marginTop: 2 },
  chevron: { color: colors.secondaryForeground, fontSize: 20 },
  statsRow: { flexDirection: "row", gap: 8, marginHorizontal: 20, marginBottom: 12 },
  statCard: { flex: 1, borderRadius: 20, padding: 12, alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  statValue: { fontFamily: fonts.display, fontSize: 24 },
  statLabel: { color: colors.mutedForeground, fontSize: 11, marginTop: 2 },
  card: { marginHorizontal: 20, marginBottom: 12, borderRadius: 20, padding: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  cardLabel: { color: colors.mutedForeground, fontSize: 11, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 },
  personal: { color: colors.foreground, fontFamily: fonts.display, fontSize: 16 },
  sub: { color: colors.secondaryForeground, fontSize: 12, marginTop: 2 },
  alertBanner: { marginHorizontal: 20, marginBottom: 12, borderRadius: 20, padding: 16, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(217,28,28,0.09)", borderWidth: 1, borderColor: "rgba(217,28,28,0.28)" },
  alertIcon: { width: 32, height: 32, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  alertTitle: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  sessionsCard: { marginHorizontal: 20, marginBottom: 20, borderRadius: 24, overflow: "hidden", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  sessionsHeader: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  sessionRow: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  sessionIcon: { width: 32, height: 32, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sessionName: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
  sessionTime: { fontSize: 12, fontWeight: "600" },
});
