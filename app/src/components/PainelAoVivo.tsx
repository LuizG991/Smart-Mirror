import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { EstadoAluno, urlVideo } from "../services/aovivo";
import { colors, fonts } from "../theme";

const COR = { ok: colors.ok, warn: colors.warn, danger: colors.danger };
const ROTULO = { ok: "Correto", warn: "Atenção", danger: "Erro" };

// Painel de UM aluno: botão Ligar/Parar monitoramento, vídeo e leitura da IA.
export default function PainelAoVivo({
  titulo: tituloPainel,
  numero,
  estado,
  erro,
  ocupado,
  onLigar,
  onParar,
}: {
  titulo?: string; // padrão: "Monitoramento do Aluno N"
  numero: number;
  estado: EstadoAluno | null;
  erro: string; // erro de conexão com o servidor da câmera
  ocupado: boolean;
  onLigar: () => void;
  onParar: () => void;
}) {
  const ligado = !!estado?.ligado;
  const a = estado?.analise;
  const semAnalise = !estado || estado.clipes_analisados === 0;
  const videoSrc = useMemo(() => urlVideo(numero), [ligado, numero]);
  const semConexao = !estado && !!erro;
  const pose = estado?.pose;

  let fase = "Monitoramento desligado";
  if (ligado) {
    fase = estado!.gravando
      ? `Gravando clipe · ${estado!.segundos_restantes}s`
      : "Iniciando…";
    if (estado!.analisando) fase += " · analisando com IA";
  }

  // Falhas da IA (503 "alta demanda" etc.) nunca aparecem aqui: o servidor troca de versão sozinho.
  const erroIA = /gemini|503|unavailable|high demand|alta demanda|falha ao analisar|nenhuma vers/i;
  const erroEstado = estado?.erro && !erroIA.test(estado.erro) ? estado.erro : "";
  const mensagemErro = erro || erroEstado;

  return (
    <View style={styles.card}>
      <View style={styles.topo}>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo}>
            {tituloPainel ?? `Monitoramento do Aluno ${numero}`}
          </Text>
          <Text style={styles.fase}>{fase}</Text>
        </View>
        <TouchableOpacity
          disabled={ocupado || semConexao}
          onPress={ligado ? onParar : onLigar}
          style={[
            styles.botao,
            ligado ? styles.botaoParar : styles.botaoLigar,
            (ocupado || semConexao) && { opacity: 0.5 },
          ]}
        >
          {ocupado ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.botaoTexto}>
              {ligado ? "Desativar" : "Ativar monitoramento"}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {!!mensagemErro && (
        <View style={styles.erroBox}>
          <Text style={styles.erroTexto}>{mensagemErro}</Text>
        </View>
      )}

      {ligado &&
        Platform.OS === "web" &&
        React.createElement("img", {
          src: videoSrc,
          alt: tituloPainel ?? `Câmera do Aluno ${numero}`,
          style: {
            width: "100%",
            maxHeight: 320,
            objectFit: "cover",
            borderRadius: 14,
            marginTop: 12,
            backgroundColor: "#000",
          },
        })}

      {ligado && pose?.ativa && (
        <View style={styles.poseBox}>
          <View style={styles.poseTopo}>
            <View
              style={[
                styles.poseDot,
                {
                  backgroundColor: pose.detectada
                    ? colors.ok
                    : colors.mutedForeground,
                },
              ]}
            />
            <Text style={styles.poseTitulo}>
              {pose.detectada
                ? "Pose detectada · ângulos ao vivo"
                : "Procurando a pessoa no enquadramento…"}
            </Text>
          </View>
          {pose.detectada && (
            <View style={styles.poseChips}>
              {Object.entries(pose.angulos).map(([nome, graus]) => (
                <View key={nome} style={styles.poseChip}>
                  <Text style={styles.poseChipTexto}>
                    {nome} <Text style={styles.poseChipGrau}>{graus}°</Text>
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {ligado && a && (
        <View style={styles.leitura}>
          {semAnalise ? (
            <Text style={styles.feedback}>
              Gravando o primeiro clipe de 15s… o resultado aparece aqui assim
              que a IA responder (a análise se repete a cada clipe).
            </Text>
          ) : (
            <>
              <View style={styles.linha}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exercicio}>{a.exercise}</Text>
                  <Text style={styles.meta}>
                    {a.reps}/{a.targetReps} reps · {a.sets}
                  </Text>
                </View>
                <View
                  style={[styles.selo, { backgroundColor: COR[a.status] + "22" }]}
                >
                  <Text style={[styles.seloTexto, { color: COR[a.status] }]}>
                    {ROTULO[a.status]}
                  </Text>
                </View>
              </View>
              {!!a.feedback && (
                <Text style={[styles.feedback, { color: COR[a.status] }]}>
                  {a.feedback}
                </Text>
              )}
              <Text style={styles.rodape}>
                {estado!.clipes_analisados} clipe(s) analisado(s)
                {estado!.atualizado_em
                  ? ` · última análise ${new Date(estado!.atualizado_em).toLocaleTimeString()}`
                  : ""}
              </Text>
            </>
          )}
        </View>
      )}

      {!ligado && !mensagemErro && (
        <Text style={styles.dica}>
          Toque em “Ativar monitoramento” para abrir a webcam do PC. A IA
          analisa um clipe por vez (15 s o primeiro, 30 s os seguintes) e o resultado aparece aqui.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  topo: { flexDirection: "row", alignItems: "center", gap: 12 },
  titulo: { color: colors.foreground, fontFamily: fonts.display, fontSize: 15 },
  fase: { color: colors.mutedForeground, fontSize: 12, marginTop: 2 },
  botao: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 128,
    alignItems: "center",
  },
  botaoLigar: { backgroundColor: colors.primary },
  botaoParar: {
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  botaoTexto: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
  },
  erroBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,59,48,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,59,48,0.25)",
  },
  erroTexto: { color: colors.danger, fontSize: 12 },
  poseBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  poseTopo: { flexDirection: "row", alignItems: "center", gap: 8 },
  poseDot: { width: 8, height: 8, borderRadius: 4 },
  poseTitulo: { color: colors.secondaryForeground, fontSize: 12, fontWeight: "600" },
  poseChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  poseChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  poseChipTexto: { color: colors.mutedForeground, fontSize: 11 },
  poseChipGrau: { color: colors.foreground, fontWeight: "700" },
  leitura: { marginTop: 14, gap: 8 },
  linha: { flexDirection: "row", alignItems: "center", gap: 12 },
  exercicio: {
    color: colors.foreground,
    fontFamily: fonts.display,
    fontSize: 18,
  },
  meta: { color: colors.mutedForeground, fontSize: 12, marginTop: 2 },
  selo: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  seloTexto: { fontSize: 12, fontWeight: "700" },
  feedback: { color: colors.secondaryForeground, fontSize: 13 },
  rodape: { color: colors.mutedForeground, fontSize: 11 },
  dica: { color: colors.mutedForeground, fontSize: 12, marginTop: 12 },
});
