import { router } from "expo-router";
import { useState } from "react";
import { StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import BottomNav, { NavItem } from "../components/BottomNav";
import { IBell, IGrid, IMonitor, IUser } from "../components/Icons";
import { useAlertas } from "../hooks/useAlertas";
import { useMeuPerfil } from "../hooks/useMeuPerfil";
import { useSessoesHoje } from "../hooks/useSessoesHoje";
import { getUsuario, sair } from "../services/api";
import { colors } from "../theme";
import { Screen } from "../types";

import AlertsScreen from "./AlertsScreen";
import AlunoDashboard from "./AlunoDashboard";
import AlunoMonitor from "./AlunoMonitor";
import AlunoPerfil from "./AlunoPerfil";

// Abas do ALUNO: Início (meu treino), Monitorar (auto-monitoramento), Alertas (meus) e Perfil.
export default function HomeAluno({ onLogout }: { onLogout?: () => void }) {
  const [screen, setScreen] = useState<Screen>("dashboard");

  const { alerts, loading, error, recarregar } = useAlertas();
  const { sessoes } = useSessoesHoje();
  const { perfil, loading: carregandoPerfil, error: erroPerfil } = useMeuPerfil();

  const usuario = getUsuario();
  const pendentes = alerts.filter((a) => !a.resolved).length;

  const logout = async () => {
    await sair();
    setScreen("dashboard");
    if (onLogout) onLogout();
    else router.replace("/");
  };

  const NAV: NavItem[] = [
    { id: "dashboard", label: "Início", Icon: IGrid },
    { id: "monitor", label: "Monitorar", Icon: IMonitor },
    { id: "alerts", label: "Meus alertas", Icon: IBell },
    { id: "profile", label: "Perfil", Icon: IUser },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          {screen === "dashboard" && (
            <AlunoDashboard
              userName={usuario?.nome ?? ""}
              perfil={perfil}
              alerts={alerts}
              sessoes={sessoes}
              onNav={setScreen}
            />
          )}
          {screen === "monitor" && (
            <AlunoMonitor
              vaga={perfil?.vaga ?? null}
              carregando={carregandoPerfil && !perfil && !erroPerfil}
              erroPerfil={erroPerfil}
            />
          )}
          {screen === "alerts" && (
            <AlertsScreen
              titulo="Meus alertas"
              alerts={alerts}
              loading={loading}
              error={error}
              onRefresh={recarregar}
            />
          )}
          {screen === "profile" && (
            <AlunoPerfil usuario={usuario} perfil={perfil} onLogout={logout} />
          )}
        </View>

        <BottomNav
          items={NAV}
          active={screen}
          badges={{ alerts: pendentes }}
          onPress={setScreen}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
});
