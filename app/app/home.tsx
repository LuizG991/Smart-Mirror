import { router } from "expo-router";
import { useState } from "react";
import { StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import BottomNav, { NavItem } from "../src/components/BottomNav";
import { IBell, IGrid, IMonitor, IUser } from "../src/components/Icons";
import { useAlertas } from "../src/hooks/useAlertas";
import { useAlunos } from "../src/hooks/useAlunos";
import { useSessoesHoje } from "../src/hooks/useSessoesHoje";
import { getUsuario, isDemoApp, sair } from "../src/services/api";
import { colors } from "../src/theme";
import { Screen } from "../src/types";

import AlertsScreen from "../src/screens/AlertsScreen";
import Dashboard from "../src/screens/Dashboard";
import HomeAluno from "../src/screens/HomeAluno";
import Monitor from "../src/screens/Monitor";
import MonitorDemo from "../src/screens/MonitorDemo";
import Profile from "../src/screens/Profile";

// Aluno e Visitante veem as abas do aluno; só o Personal vê as abas do personal.
export default function Home({ onLogout }: { onLogout?: () => void }) {
  const aluno = getUsuario()?.tipo_perfil === "ALUNO";
  return aluno ? (
    <HomeAluno onLogout={onLogout} />
  ) : (
    <HomePersonal onLogout={onLogout} />
  );
}

function HomePersonal({ onLogout }: { onLogout?: () => void }) {
  const [screen, setScreen] = useState<Screen>("dashboard");
  // Muda ao tocar de novo em "Monitorar": volta para a lista Aluno 1, 2, 3
  const [monitorKey, setMonitorKey] = useState(0);

  // Tudo abaixo vem da API e atualiza sozinho
  const {
    alerts,
    loading: loadingAlertas,
    error: erroAlertas,
    resolver,
    recarregar: recarregarAlertas,
  } = useAlertas();
  const { students, recarregar: recarregarAlunos } = useAlunos();
  const { sessoes } = useSessoesHoje();

  const nomeUsuario = getUsuario()?.nome ?? "";

  const resolveAlert = async (id: string) => {
    await resolver(id);
    recarregarAlunos(); // o status do aluno pode ter voltado para "Correto"
  };

  const logout = async () => {
    await sair(); // apaga o token salvo no aparelho
    setScreen("dashboard");
    if (onLogout) {
      onLogout();
    } else {
      router.replace("/");
    }
  };

  const unresolvedCount = alerts.filter((a) => !a.resolved).length;

  const NAV: NavItem[] = [
    { id: "dashboard", label: "Início", Icon: IGrid },
    // Na versão de demonstração a aba envia vídeos para análise em vez de ligar a câmera
    { id: "monitor", label: isDemoApp() ? "Analisar" : "Monitorar", Icon: IMonitor },
    { id: "alerts", label: "Alertas", Icon: IBell },
    { id: "profile", label: "Perfil", Icon: IUser },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          {screen === "dashboard" && (
            <Dashboard
              students={students}
              alerts={alerts}
              sessoes={sessoes}
              userName={nomeUsuario}
              onNav={setScreen}
            />
          )}
          {screen === "monitor" &&
            (isDemoApp() ? (
              <MonitorDemo
                key={monitorKey}
                students={students}
                onAnalisado={() => {
                  recarregarAlertas();
                  recarregarAlunos();
                }}
              />
            ) : (
              <Monitor
                key={monitorKey}
                students={students}
                onStudentsChanged={recarregarAlunos}
              />
            ))}
          {screen === "alerts" && (
            <AlertsScreen
              alerts={alerts}
              onResolve={resolveAlert}
              loading={loadingAlertas}
              error={erroAlertas}
              onRefresh={recarregarAlertas}
            />
          )}
          {screen === "profile" && (
            <Profile
              students={students}
              onLogout={logout}
              onStudentsChanged={recarregarAlunos}
            />
          )}
        </View>

        <BottomNav
          items={NAV}
          active={screen}
          badges={{ alerts: unresolvedCount }}
          onPress={(id) => {
            if (id === "monitor" && screen === "monitor") {
              setMonitorKey((k) => k + 1);
            }
            setScreen(id);
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
});
