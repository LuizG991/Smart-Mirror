import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ICheck, IDanger, IWarn } from "../components/Icons";
import { STATUS_BG, STATUS_COLOR, STATUS_LABEL } from "../data";
import {
  adicionarHistorico,
  analisarVideo,
  escolherVideo,
  formatarTamanho,
  FORMATOS_VIDEO,
  ItemHistorico,
  LIMITE_VIDEO_MB,
  obterHistorico,
  VideoEscolhido,
} from "../services/analiseVideo";
import { registrarAnaliseDemo } from "../services/demo";
import { colors, fonts } from "../theme";
import { Student } from "../types";

const p2 = (n: number) => String(n).padStart(2, "0");
const hora = (iso: string) => {
  const d = new Date(iso);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

// Aba "Monitorar" da VERSÃO DE DEMONSTRAÇÃO: no lugar da câmera ao vivo, o personal escolhe um
// aluno, envia um vídeo de exercício e a IA (Gemini) analisa a execução. O resultado atualiza o
// aluno e os alertas do app, e o servidor da câmera grava a análise em um .txt (camera/analises).
export default function MonitorDemo({
  students,
  onAnalisado,
}: {
  students: Student[];
  onAnalisado?: () => void;
}) {
  const [alunoId, setAlunoId] = useState<string | null>(null);
  const [video, setVideo] = useState<VideoEscolhido | null>(null);
  const [etapa, setEtapa] = useState("");
  const [analisando, setAnalisando] = useState(false);
  const [erro, setErro] = useState("");
  const [ultimo, setUltimo] = useState<ItemHistorico | null>(null);
  const [historico, setHistorico] = useState<ItemHistorico[]>(obterHistorico());

  const aluno = students.find((s) => s.id === alunoId) ?? students[0] ?? null;

  const escolher = async () => {
    setErro("");
    try {
      const v = await escolherVideo();
      if (!v) return; // cancelou
      if (v.tamanho && v.tamanho > LIMITE_VIDEO_MB * 1024 * 1024) {
        setVideo(null);
        setErro(`Vídeo grande demais (máximo ${LIMITE_VIDEO_MB} MB).`);
        return;
      }
      setVideo(v);
    } catch (e: any) {
      setErro(e.message);
    }
  };

  const analisar = async () => {
    if (!video || !aluno || analisando) return;
    setErro("");
    setAnalisando(true);
    try {
      const andamento = await analisarVideo(video, aluno.name, setEtapa);
      const resultado = andamento.resultado!;
      // Atualiza o aluno, a sessão de hoje e (se houve erro) os alertas do app
      registrarAnaliseDemo(Number(aluno.id), resultado);
      const item: ItemHistorico = {
        id: andamento.id,
        alunoId: aluno.id,
        alunoNome: aluno.name,
        arquivo: andamento.arquivo,
        resultado,
        modelo: andamento.modelo,
        arquivoTxt: andamento.arquivo_txt,
        quando: new Date().toISOString(),
      };
      adicionarHistorico(item);
      setHistorico(obterHistorico());
      setUltimo(item);
      setVideo(null);
      onAnalisado?.();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setAnalisando(false);
      setEtapa("");
    }
  };

  const r = ultimo?.resultado;
  const anteriores = historico.filter((h) => h.id !== ultimo?.id);

  return (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Análise de vídeo</Text>
          <Text style={styles.subtitle}>
            Envie um vídeo de exercício para a IA analisar
          </Text>
        </View>
        <View style={styles.demoBadge}>
          <Text style={styles.demoBadgeText}>DEMONSTRAÇÃO</Text>
        </View>
      </View>

      <View style={styles.bloco}>
        <Text style={styles.label}>Aluno</Text>
        {students.length === 0 ? (
          <Text style={styles.ajuda}>Carregando alunos de exemplo…</Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {students.map((s) => {
              const ativo = s.id === aluno?.id;
              return (
                <TouchableOpacity
                  key={s.id}
                  disabled={analisando}
                  onPress={() => setAlunoId(s.id)}
                  activeOpacity={0.8}
                  style={[styles.chip, ativo && styles.chipAtivo]}
                >
                  <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      <View style={styles.bloco}>
        <Text style={styles.label}>Vídeo do exercício</Text>
        {!video ? (
          <TouchableOpacity
            onPress={escolher}
            disabled={analisando}
            activeOpacity={0.8}
            style={styles.escolher}
          >
            <View style={styles.mais}>
              <Text style={styles.maisTexto}>+</Text>
            </View>
            <Text style={styles.escolherTitulo}>Escolher vídeo</Text>
            <Text style={styles.ajuda}>
              {FORMATOS_VIDEO} · até {LIMITE_VIDEO_MB} MB
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.arquivo}>
            <Text style={styles.arquivoNome} numberOfLines={1}>
              {video.nome}
            </Text>
            {!!video.tamanho && (
              <Text style={styles.ajuda}>{formatarTamanho(video.tamanho)}</Text>
            )}
            {!analisando && (
              <TouchableOpacity onPress={escolher} style={styles.trocar}>
                <Text style={styles.trocarTexto}>Trocar vídeo</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {!!video && (
          <TouchableOpacity
            onPress={analisar}
            disabled={analisando || !aluno}
            activeOpacity={0.85}
            style={[styles.analisarBtn, analisando && { opacity: 0.6 }]}
          >
            {analisando ? (
              <View style={styles.linha}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.analisarTexto}>Analisando…</Text>
              </View>
            ) : (
              <Text style={styles.analisarTexto}>
                Analisar vídeo{aluno ? ` de ${aluno.name.split(" ")[0]}` : ""}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {analisando && (
          <Text style={[styles.ajuda, { marginTop: 10, textAlign: "center" }]}>
            {etapa || "Analisando…"} Isso pode levar de 20 s a alguns minutos.
          </Text>
        )}

        {!!erro && (
          <View style={styles.erroBox}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        )}
      </View>

      {!!ultimo && !!r && (
        <View
          style={[
            styles.card,
            {
              backgroundColor:
                r.status === "danger"
                  ? "rgba(217,28,28,0.09)"
                  : r.status === "warn"
                    ? "rgba(255,159,10,0.08)"
                    : colors.card,
              borderColor:
                r.status === "danger"
                  ? "rgba(217,28,28,0.32)"
                  : r.status === "warn"
                    ? "rgba(255,159,10,0.28)"
                    : colors.border,
            },
          ]}
        >
          <Text style={styles.label}>Resultado da análise</Text>
          <View style={styles.resultadoTopo}>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultadoExercicio}>{r.exercise}</Text>
              <Text style={styles.ajuda}>
                {ultimo.alunoNome} · {r.reps}/{r.targetReps} reps · {r.sets}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: STATUS_BG[r.status] }]}>
              {r.status === "danger" ? (
                <IDanger size={13} color={STATUS_COLOR[r.status]} />
              ) : r.status === "warn" ? (
                <IWarn size={13} color={STATUS_COLOR[r.status]} />
              ) : (
                <ICheck size={13} color={STATUS_COLOR[r.status]} />
              )}
              <Text style={[styles.statusTexto, { color: STATUS_COLOR[r.status] }]}>
                {STATUS_LABEL[r.status]}
              </Text>
            </View>
          </View>

          {!!r.feedback && <Text style={styles.corpo}>{r.feedback}</Text>}
          {!!r.problema && (
            <Text style={styles.detalhe}>
              <Text style={styles.detalheRotulo}>Problema: </Text>
              {r.problema}
            </Text>
          )}
          {!!r.risco && (
            <Text style={styles.detalhe}>
              <Text style={styles.detalheRotulo}>Risco de lesão: </Text>
              {r.risco}
            </Text>
          )}
          {r.status !== "ok" && (
            <Text style={styles.ajuda}>
              Um alerta foi criado na aba Alertas.
            </Text>
          )}
          {!!ultimo.arquivoTxt && (
            <Text style={styles.arquivoTxt}>
              Salva em camera/analises/{ultimo.arquivoTxt}
            </Text>
          )}
        </View>
      )}

      {anteriores.length > 0 && (
        <View style={styles.bloco}>
          <Text style={styles.label}>Análises desta sessão</Text>
          <View style={{ gap: 8 }}>
            {anteriores.map((h) => (
              <View key={h.id} style={styles.histLinha}>
                <View
                  style={[
                    styles.histPonto,
                    { backgroundColor: STATUS_COLOR[h.resultado.status] },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.histTitulo} numberOfLines={1}>
                    {h.alunoNome} · {h.resultado.exercise}
                  </Text>
                  <Text style={styles.ajuda} numberOfLines={1}>
                    {STATUS_LABEL[h.resultado.status]} · {h.arquivo}
                  </Text>
                </View>
                <Text style={styles.ajuda}>{hora(h.quando)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={{ height: 24 }} />
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
    gap: 12,
  },
  title: { color: colors.foreground, fontFamily: fonts.display, fontSize: 18 },
  subtitle: { color: colors.mutedForeground, fontSize: 12, marginTop: 2 },
  demoBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,159,10,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,159,10,0.3)",
  },
  demoBadgeText: { color: colors.warn, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  bloco: { paddingHorizontal: 20, paddingTop: 14 },
  label: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  ajuda: { color: colors.mutedForeground, fontSize: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  chipAtivo: {
    borderColor: colors.primary,
    backgroundColor: "rgba(217,28,28,0.12)",
  },
  chipTexto: { color: colors.secondaryForeground, fontSize: 13, fontWeight: "600" },
  chipTextoAtivo: { color: colors.foreground },
  escolher: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 26,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  mais: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(217,28,28,0.14)",
  },
  maisTexto: { color: colors.primary, fontSize: 24, fontWeight: "700", lineHeight: 28 },
  escolherTitulo: { color: colors.foreground, fontFamily: fonts.display, fontSize: 15 },
  arquivo: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  arquivoNome: { color: colors.foreground, fontFamily: fonts.display, fontSize: 14 },
  trocar: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trocarTexto: { color: colors.secondaryForeground, fontSize: 11, fontWeight: "600" },
  analisarBtn: {
    marginTop: 12,
    paddingVertical: 15,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  analisarTexto: { color: "#fff", fontFamily: fonts.display, fontSize: 15 },
  linha: { flexDirection: "row", alignItems: "center", gap: 8 },
  erroBox: {
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(217,28,28,0.12)",
    borderWidth: 1,
    borderColor: "rgba(217,28,28,0.35)",
  },
  erroTexto: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  card: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
  },
  resultadoTopo: { flexDirection: "row", alignItems: "center", gap: 10 },
  resultadoExercicio: { color: colors.foreground, fontFamily: fonts.display, fontSize: 17 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusTexto: { fontSize: 12, fontWeight: "700" },
  corpo: { color: colors.foreground, fontSize: 14, lineHeight: 20 },
  detalhe: { color: colors.secondaryForeground, fontSize: 13, lineHeight: 19 },
  detalheRotulo: { color: colors.foreground, fontWeight: "700" },
  arquivoTxt: { color: colors.mutedForeground, fontSize: 11, marginTop: 4 },
  histLinha: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  histPonto: { width: 8, height: 8, borderRadius: 4 },
  histTitulo: { color: colors.foreground, fontSize: 13, fontWeight: "600" },
});
