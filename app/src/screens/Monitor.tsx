import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { IDanger, IWarn } from "../components/Icons";
import { STATUS_BG, STATUS_COLOR, STATUS_LABEL } from "../data";
import { useCamera } from "../hooks/useCamera";
import { isSemBanco } from "../services/api";
import { EstadoAluno, NUMEROS_ALUNOS, nomeAluno } from "../services/aovivo";
import { colors, fonts } from "../theme";
import { Status, Student } from "../types";
import EscolherAluno from "./EscolherAluno";
import MonitorAluno from "./MonitorAluno";

// Status mostrado no cartão de cada aluno
function statusDe(e: EstadoAluno | null): Status {
  if (!e || !e.ligado || e.clipes_analisados === 0) return "resting";
  if (/nenhum|aguardando/i.test(e.analise.exercise)) return "resting";
  return e.analise.status;
}

type Vaga = (typeof NUMEROS_ALUNOS)[number];

// As vagas "Aluno 1, 2 e 3" são preenchidas com alunos do banco (alunos_perfil.vaga_monitor).
// No modo "Entrar sem login" não há banco: as vagas continuam genéricas (Aluno 1, 2, 3).
export default function Monitor({
  students = [],
  onStudentsChanged,
}: {
  students?: Student[];
  onStudentsChanged?: () => Promise<void> | void;
}) {
  const { estado, erro, ocupado, ligar, parar, resolver } = useCamera(1000);
  const [aberto, setAberto] = useState<Vaga | null>(null); // aluno aberto (1, 2 ou 3)
  const [escolhendo, setEscolhendo] = useState<Vaga | null>(null); // vaga sendo preenchida

  const comBanco = !isSemBanco();

  const doAluno = (n: number): EstadoAluno | null =>
    estado?.alunos[String(n)] ?? null;
  const alunoDaVaga = (n: number): Student | null =>
    comBanco ? (students.find((s) => s.vaga === n) ?? null) : null;
  const rotulo = (n: number) => alunoDaVaga(n)?.name ?? nomeAluno(n);

  // Escolher / trocar o aluno de uma vaga (só com banco)
  if (escolhendo !== null) {
    return (
      <EscolherAluno
        vaga={escolhendo}
        students={students}
        onClose={() => setEscolhendo(null)}
        onChanged={onStudentsChanged}
      />
    );
  }

  // Dentro do aluno: é aqui que se ativa o monitoramento
  if (aberto !== null) {
    const nome = rotulo(aberto);
    return (
      <MonitorAluno
        numero={aberto}
        titulo={nome}
        tituloPainel={`Monitoramento de ${nome}`}
        estado={doAluno(aberto)}
        erro={erro}
        ocupado={ocupado === aberto}
        onLigar={() => ligar(aberto)}
        onParar={() => parar(aberto)}
        onResolver={resolver}
        onVoltar={() => setAberto(null)}
      />
    );
  }

  const algumLigado = NUMEROS_ALUNOS.some((n) => doAluno(n)?.ligado);

  return (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Monitorar</Text>
          <Text style={styles.subtitle}>Escolha um aluno para ativar</Text>
        </View>
        <View
          style={[styles.liveBadge, !algumLigado && styles.liveBadgeOff]}
        >
          <View
            style={[
              styles.liveDot,
              !algumLigado && { backgroundColor: colors.mutedForeground },
            ]}
          />
          <Text
            style={[
              styles.liveText,
              !algumLigado && { color: colors.mutedForeground },
            ]}
          >
            {algumLigado ? "AO VIVO" : "PARADO"}
          </Text>
        </View>
      </View>

      {!!erro && !estado && (
        <View style={styles.infoBox}>
          <Text style={styles.infoErro}>{erro}</Text>
        </View>
      )}

      <View style={styles.list}>
        {NUMEROS_ALUNOS.map((n) => {
          const aluno = alunoDaVaga(n);
          const vagaLivre = comBanco && !aluno;
          const e = doAluno(n);
          const status = statusDe(e);
          const ligado = !!e?.ligado;
          const a = e?.analise;
          const temLeitura = ligado && status !== "resting" && !!a;

          return (
            <View key={n}>
              <TouchableOpacity
                onPress={() => (vagaLivre ? setEscolhendo(n) : setAberto(n))}
                style={[
                  styles.card,
                  {
                    backgroundColor:
                      status === "danger" ? "rgba(217,28,28,0.09)" : colors.card,
                    borderColor:
                      status === "danger"
                        ? "rgba(217,28,28,0.32)"
                        : status === "warn"
                          ? "rgba(255,159,10,0.25)"
                          : colors.border,
                  },
                ]}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
                >
                  <View
                    style={[styles.avatar, { backgroundColor: STATUS_BG[status] }]}
                  >
                    <Text
                      style={[styles.avatarText, { color: STATUS_COLOR[status] }]}
                    >
                      {aluno?.avatar ?? n}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      {vagaLivre ? `Aluno ${n} · vaga livre` : rotulo(n)}
                    </Text>
                    <Text style={styles.meta}>
                      {vagaLivre
                        ? "Toque para escolher um aluno"
                        : !ligado
                          ? "Monitoramento desligado"
                          : temLeitura
                            ? `${a!.exercise} · ${a!.sets}`
                            : e!.clipes_analisados === 0
                              ? "Ligado · aguardando a primeira análise"
                              : "Ligado · nenhum exercício detectado"}
                    </Text>
                  </View>
                  {vagaLivre ? (
                    <Text style={styles.vagaLivreAcao}>Escolher</Text>
                  ) : (
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <View
                        style={[styles.badge, { backgroundColor: STATUS_BG[status] }]}
                      >
                        <Text
                          style={[styles.badgeText, { color: STATUS_COLOR[status] }]}
                        >
                          {ligado && status === "resting"
                            ? "Ligado"
                            : STATUS_LABEL[status]}
                        </Text>
                      </View>
                      {temLeitura && (
                        <Text style={styles.reps}>
                          {a!.reps}/{a!.targetReps} reps
                        </Text>
                      )}
                    </View>
                  )}
                </View>

                {temLeitura && (
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.min(
                            100,
                            (a!.reps / (a!.targetReps || 1)) * 100,
                          )}%`,
                          backgroundColor: STATUS_COLOR[status],
                        },
                      ]}
                    />
                  </View>
                )}

                {temLeitura && (status === "danger" || status === "warn") && (
                  <View style={styles.warnRow}>
                    {status === "danger" ? (
                      <IDanger size={14} color={STATUS_COLOR[status]} />
                    ) : (
                      <IWarn size={14} color={STATUS_COLOR[status]} />
                    )}
                    <Text style={[styles.warnText, { color: STATUS_COLOR[status] }]}>
                      {a!.feedback ||
                        (status === "danger"
                          ? "Erro de execução — toque para detalhes"
                          : "Atenção na técnica — verifique")}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {comBanco && !vagaLivre && (
                <TouchableOpacity
                  onPress={() => setEscolhendo(n)}
                  style={styles.trocarBtn}
                >
                  <Text style={styles.trocarTexto}>Trocar aluno</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  infoBox: {
    marginHorizontal: 20,
    marginTop: 8,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoErro: { color: colors.danger, fontSize: 13 },
  title: { color: colors.foreground, fontFamily: fonts.display, fontSize: 18 },
  subtitle: { color: colors.mutedForeground, fontSize: 12, marginTop: 2 },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(48,209,88,0.10)",
    borderWidth: 1,
    borderColor: "rgba(48,209,88,0.25)",
  },
  liveBadgeOff: {
    backgroundColor: colors.secondary,
    borderColor: colors.border,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ok },
  liveText: { color: colors.ok, fontSize: 11, fontWeight: "700" },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, gap: 12 },
  card: { borderRadius: 20, padding: 16, borderWidth: 1 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.display, fontSize: 16 },
  name: { color: colors.foreground, fontFamily: fonts.display, fontSize: 14 },
  meta: { color: colors.mutedForeground, fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  reps: { color: colors.mutedForeground, fontSize: 11 },
  progressTrack: {
    marginTop: 12,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.muted,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 999 },
  warnRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  warnText: { fontSize: 12, flex: 1 },
  trocarBtn: {
    marginTop: 8,
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trocarTexto: { color: colors.secondaryForeground, fontSize: 11, fontWeight: "600" },
  vagaLivreAcao: { color: colors.primary, fontSize: 12, fontWeight: "700" },
});

