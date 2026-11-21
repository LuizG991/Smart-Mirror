import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "../theme";
import { Screen } from "../types";
import { IGrid } from "./Icons";

export type NavItem = { id: Screen; label: string; Icon: typeof IGrid };

// Menu de baixo, usado pelo Personal e pelo Aluno (cada um com as suas abas).
export default function BottomNav({
  items,
  active,
  badges = {},
  onPress,
}: {
  items: NavItem[];
  active: Screen;
  badges?: Partial<Record<Screen, number>>;
  onPress: (id: Screen) => void;
}) {
  return (
    <View style={styles.bottomNav}>
      {items.map((item) => {
        const isActive = active === item.id;
        const badge = badges[item.id] ?? 0;
        const color = isActive ? colors.primary : colors.mutedForeground;
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => onPress(item.id)}
            style={styles.navItem}
          >
            <item.Icon size={20} color={color} />
            <Text style={[styles.navLabel, { color }]}>{item.label}</Text>
            {badge > 0 && (
              <View style={styles.navBadge}>
                <Text style={styles.navBadgeText}>{badge}</Text>
              </View>
            )}
            {isActive && <View style={styles.navDot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 4 : 10,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  navLabel: { fontSize: 11, fontWeight: "500" },
  navBadge: {
    position: "absolute",
    top: -2,
    right: "22%",
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  navBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  navDot: {
    position: "absolute",
    bottom: -4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
});
