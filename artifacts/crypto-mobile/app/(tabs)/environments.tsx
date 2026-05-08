import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { type Environment, useListEnvironments } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

function formatLastScanned(ts: string | null | undefined): string {
  if (!ts) return "Never scanned";
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function EnvironmentTypeIcon({ type, color }: { type: string; color: string }) {
  const iconMap: Record<string, string> = {
    aws: "aws",
    azure: "microsoft-azure",
    gcp: "google-cloud",
    vmware: "server",
    on_premises: "server",
  };
  const icon = iconMap[type] ?? "server";
  return <MaterialCommunityIcons name={icon as never} size={22} color={color} />;
}

function StatusDot({ status }: { status: string }) {
  const colors = useColors();
  const statusColors: Record<string, string> = {
    connected: colors.success,
    disconnected: colors.mutedForeground,
    scanning: colors.primary,
    error: colors.critical,
  };
  const dotColor = statusColors[status] ?? colors.mutedForeground;
  const isPulsing = status === "scanning";
  return (
    <View style={styles.dotContainer}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      {isPulsing && (
        <View style={[styles.dotRing, { borderColor: dotColor }]} />
      )}
    </View>
  );
}

function RiskBar({ score }: { score: number }) {
  const colors = useColors();
  const barColor =
    score >= 80
      ? colors.critical
      : score >= 60
      ? colors.high
      : score >= 40
      ? colors.medium
      : colors.success;
  return (
    <View style={styles.riskBarContainer}>
      <View style={[styles.riskBarTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.riskBarFill,
            { width: `${Math.min(100, score)}%`, backgroundColor: barColor },
          ]}
        />
      </View>
      <Text style={[styles.riskScore, { color: barColor }]}>{score}</Text>
    </View>
  );
}

function EnvironmentCard({ env }: { env: Environment }) {
  const colors = useColors();
  const typeLabels: Record<string, string> = {
    aws: "Amazon Web Services",
    azure: "Microsoft Azure",
    gcp: "Google Cloud Platform",
    vmware: "VMware vSphere",
    on_premises: "On-Premises",
  };

  return (
    <View
      testID={`env-card-${env.id}`}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.cardTop}>
        <View style={[styles.iconWrap, { backgroundColor: colors.secondary }]}>
          <EnvironmentTypeIcon type={env.type} color={colors.primary} />
        </View>
        <View style={styles.cardMeta}>
          <Text style={[styles.envName, { color: colors.foreground }]} numberOfLines={1}>
            {env.name}
          </Text>
          <Text style={[styles.envType, { color: colors.mutedForeground }]}>
            {typeLabels[env.type] ?? env.type}
          </Text>
          {env.region ? (
            <Text style={[styles.envRegion, { color: colors.mutedForeground }]}>
              <Feather name="map-pin" size={10} /> {env.region}
            </Text>
          ) : null}
        </View>
        <View style={styles.statusArea}>
          <StatusDot status={env.status} />
          <Text style={[styles.statusLabel, { color: colors.mutedForeground }]}>
            {env.status}
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.cardBottom}>
        <View style={styles.riskSection}>
          <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Risk Score</Text>
          <RiskBar score={env.riskScore} />
        </View>
        <View style={styles.assetSection}>
          <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Assets</Text>
          <Text style={[styles.assetCount, { color: colors.foreground }]}>{env.assetCount}</Text>
        </View>
        <View style={styles.scanSection}>
          <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Last Scan</Text>
          <Text style={[styles.scanTime, { color: colors.foreground }]}>
            {formatLastScanned(env.lastScannedAt)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function EnvironmentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data: environments, isLoading, refetch, isRefetching } = useListEnvironments();

  const containerStyle = {
    flex: 1 as const,
    backgroundColor: colors.background,
    paddingTop: topPad,
    paddingBottom: Platform.OS === "web" ? 34 : 0,
  };

  if (isLoading) {
    return (
      <View style={[containerStyle, styles.centered]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <View style={[styles.pageHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>Environments</Text>
        <Text style={[styles.pageCount, { color: colors.mutedForeground }]}>
          {environments?.length ?? 0} connected
        </Text>
      </View>

      <FlatList
        data={environments ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!(environments && environments.length > 0)}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="cloud-off" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No environments</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Add environments from the web app to start monitoring
            </Text>
          </View>
        }
        renderItem={({ item }) => <EnvironmentCard env={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pageTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  pageCount: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  listContent: {
    padding: 12,
    gap: 10,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardMeta: {
    flex: 1,
    gap: 2,
  },
  envName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  envType: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  envRegion: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  statusArea: {
    alignItems: "center",
    gap: 4,
  },
  dotContainer: {
    width: 12,
    height: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotRing: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    opacity: 0.5,
  },
  statusLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textTransform: "capitalize",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  cardBottom: {
    flexDirection: "row",
    gap: 12,
  },
  riskSection: {
    flex: 2,
    gap: 4,
  },
  assetSection: {
    flex: 1,
    gap: 4,
  },
  scanSection: {
    flex: 1.5,
    gap: 4,
  },
  metaLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  riskBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  riskBarTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  riskBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  riskScore: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    minWidth: 20,
    textAlign: "right",
  },
  assetCount: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  scanTime: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  emptyState: {
    paddingTop: 80,
    alignItems: "center",
    gap: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 32,
  },
});
