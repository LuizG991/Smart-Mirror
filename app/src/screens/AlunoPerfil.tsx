import { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import SubPage from "../components/SubPage";
import { formatarNome } from "../format";
import { isSemBanco, PerfilAluno, Usuario } from "../services/api";
import { colors, fonts } from "../theme";
import SuportePage from "./SuportePage";

// Perfil do ALUNO: dados dele, personal responsável, suporte e sair.
export default function AlunoPerfil({
  usuario,
  perfil,
  onLogout,
}: {
  usuario: Usuario | null;
  perfil: PerfilAluno | null;
  onLogout: () => void;
}) {
  const [suporte, setSuporte] = useState(false);
  const nome = formatarNome(perfil?.nome ?? usuario?.nome ?? "");
  const visitante = isSemBanco();

  const dados: { label: string; valor: string }[] = visitante
    ? [
        { label: "Acesso", valor: "Visitante" },
        { label: "Personal", valor: "Sem personal" },
      ]
    : [
    { label: "E-mail", valor: perfil?.email ?? usuario?.email ?? "—" },
    { label: "Objetivo", valor: perfil?.objetivo ?? "—" },
    { label: "Plano", valor: perfil?.plano ?? "—" },
    { label: "Idade", valor: perfil?.idade ? `${perfil.idade} anos` : "—" },
    {
      label: "Personal",
      valor: perfil?.personal_nome ? formatarNome(perfil.personal_nome) : "Sem personal",
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      {suporte && (
        <SubPage title="Suporte" onClose={() => setSuporte(false)}>
          <SuportePage />
        </SubPage>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{nome.charAt(0)}</Text>
          </View>
          <Text style={styles.name}>{nome}</Text>
          <Text style={styles.role}>{visitante ? "Visitante" : "Aluno"}</Text>
          <View style={styles.statsRow}>
            <View style={{ alignItems: "center" }}>
              <Text style={styles.statValue}>{perfil?.total_sessoes ?? 0}</Text>
              <Text style={styles.statLabel}>Sessões</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{visitante ? "Meu acesso" : "Meus dados"}</Text>
          {dados.map((d, i) => (
            <View key={d.label} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <Text style={styles.rowLabel}>{d.label}</Text>
              <Text style={styles.rowValue} numberOfLines={1}>{d.valor}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <TouchableOpacity onPress={() => setSuporte(true)} style={styles.row}>
            <Text style={styles.rowValueLeft}>🛟  Suporte</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onLogout} style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Text style={[styles.rowValueLeft, { color: colors.primary }]}>{visitante ? "Sair" : "Sair da conta"}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", paddingTop: 24, paddingBottom: 16, gap: 4 },
  avatar: { width: 72, height: 72, borderRadius: 24, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  avatarText: { color: "#fff", fontFamily: fonts.display, fontSize: 28 },
  name: { color: colors.foreground, fontFamily: fonts.display, fontSize: 18 },
  role: { color: colors.mutedForeground, fontSize: 12 },
  statsRow: { flexDirection: "row", gap: 32, marginTop: 12 },
  statValue: { color: colors.foreground, fontFamily: fonts.display, fontSize: 20 },
  statLabel: { color: colors.mutedForeground, fontSize: 11, marginTop: 2 },
  card: { marginHorizontal: 20, marginBottom: 12, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  cardLabel: { color: colors.mutedForeground, fontSize: 11, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowLabel: { color: colors.secondaryForeground, fontSize: 13 },
  rowValue: { color: colors.foreground, fontSize: 13, fontWeight: "600", flexShrink: 1 },
  rowValueLeft: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
  chevron: { color: colors.secondaryForeground, fontSize: 20 },
});
