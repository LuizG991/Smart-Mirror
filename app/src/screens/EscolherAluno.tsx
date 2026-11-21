import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AlunoDisponivel,
  atribuirVaga,
  listarDisponiveis,
  vincularAluno,
} from "../services/api";
import { colors, fonts } from "../theme";
import { Student } from "../types";

// Escolhe quem ocupa a vaga "Aluno N" da aba Monitorar:
//  - alunos que o personal já tem (vindos do banco), ou
//  - alunos já registrados no app que ainda não têm personal (são adicionados ao tocar).
export default function EscolherAluno({
  vaga,
  students,
  onClose,
  onChanged,
}: {
  vaga: 1 | 2 | 3;
  students: Student[];
  onClose: () => void;
  onChanged?: () => Promise<void> | void;
}) {
  const [registrados, setRegistrados] = useState<AlunoDisponivel[] | null>(null);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null);

  useEffect(() => {
    listarDisponiveis()
      .then(setRegistrados)
      .catch((e) => {
        setRegistrados([]);
        setErro(e.message);
      });
  }, []);

  const atual = students.find((s) => s.vaga === vaga) ?? null;
  const termo = busca.trim().toLowerCase();

  const meus = students.filter(
    (s) => s.id !== atual?.id && s.name.toLowerCase().includes(termo),
  );
  const novos = (registrados ?? []).filter(
    (a) =>
      a.nome.toLowerCase().includes(termo) ||
      a.email.toLowerCase().includes(termo),
  );

  const executar = async (chave: string, acao: () => Promise<unknown>) => {
    setSalvando(chave);
    setErro("");
    try {
      await acao();
      await onChanged?.();
      onClose();
    } catch (e: any) {
      setErro(e.message);
      setSalvando(null);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onClose}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Aluno {vaga}</Text>
          <Text style={styles.subtitle}>
            {atual ? `Agora: ${atual.name}` : "Vaga livre"}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TextInput
          value={busca}
          onChangeText={setBusca}
          placeholder="Buscar por nome ou e-mail…"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          style={styles.input}
        />

        {!!erro && <Text style={styles.erro}>{erro}</Text>}

        {atual && (
          <TouchableOpacity
            disabled={!!salvando}
            onPress={() =>
              executar("liberar", () => atribuirVaga(Number(atual.id), null))
            }
            style={styles.liberar}
          >
            <Text style={styles.liberarTexto}>
              {salvando === "liberar" ? "Liberando…" : `Deixar a vaga ${vaga} livre`}
            </Text>
          </TouchableOpacity>
        )}

        <Text style={styles.secao}>Meus alunos</Text>
        {meus.length === 0 && (
          <Text style={styles.vazio}>
            {students.length === 0
              ? "Você ainda não tem alunos. Adicione um aluno registrado abaixo."
              : "Nenhum outro aluno encontrado."}
          </Text>
        )}
        {meus.map((s) => (
          <TouchableOpacity
            key={s.id}
            disabled={!!salvando}
            onPress={() =>
              executar(`m${s.id}`, () => atribuirVaga(Number(s.id), vaga))
            }
            style={styles.linha}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarTexto}>{s.avatar}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nome}>{s.name}</Text>
              <Text style={styles.meta}>
                {s.vaga
                  ? `Está no Aluno ${s.vaga} · vão trocar de lugar`
                  : s.goal !== "—"
                    ? s.goal
                    : "Sem vaga"}
              </Text>
            </View>
            {salvando === `m${s.id}` ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.acao}>Escolher</Text>
            )}
          </TouchableOpacity>
        ))}

        <Text style={styles.secao}>Alunos registrados no app</Text>
        {registrados === null && <ActivityIndicator color={colors.primary} />}
        {registrados !== null && novos.length === 0 && (
          <Text style={styles.vazio}>
            Nenhum aluno registrado disponível. O aluno precisa criar uma conta
            do tipo Aluno.
          </Text>
        )}
        {novos.map((a) => (
          <TouchableOpacity
            key={a.id}
            disabled={!!salvando}
            onPress={() =>
              executar(`d${a.id}`, async () => {
                await vincularAluno({ email: a.email, plano: "Básico" });
                await atribuirVaga(a.id, vaga);
              })
            }
            style={styles.linha}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarTexto}>
                {a.nome.slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nome}>{a.nome}</Text>
              <Text style={styles.meta}>{a.email}</Text>
            </View>
            {salvando === `d${a.id}` ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.acao}>Adicionar</Text>
            )}
          </TouchableOpacity>
        ))}
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
  title: { color: colors.foreground, fontFamily: fonts.display, fontSize: 16 },
  subtitle: { color: colors.mutedForeground, fontSize: 12, marginTop: 2 },
  body: { padding: 20, gap: 10, paddingBottom: 32 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.foreground,
    fontSize: 14,
  },
  erro: { color: colors.danger, fontSize: 12 },
  secao: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 10,
  },
  vazio: { color: colors.mutedForeground, fontSize: 12 },
  linha: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTexto: { color: colors.foreground, fontFamily: fonts.display, fontSize: 13 },
  nome: { color: colors.foreground, fontFamily: fonts.display, fontSize: 14 },
  meta: { color: colors.mutedForeground, fontSize: 12, marginTop: 2 },
  acao: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  liberar: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  liberarTexto: { color: colors.foreground, fontSize: 13, fontWeight: "600" },
});
