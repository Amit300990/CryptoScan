import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useGetDashboardSummary, useGetExpiringCerts } from "@workspace/api-client-react";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

function RiskBadge({ score }: { score: number }) {
  const colors = useColors();
  const level =
    score >= 80 ? "critical" : score >= 60 ? "high" : score >= 40 ? "medium" : "low";
  const labelMap = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
  const colorMap = {
    critical: colors.critical,
    high: colors.high,
    medium: colors.medium,
    low: colors.low,
  };
  return (
    <View style={[styles.badge, { backgroundColor: colorMap[level] + "22", borderColor: colorMap[level] + "66" }]}>
      <Text style={[styles.badgeText, { color: colorMap[level] }]}>{labelMap[level]}</Text>
    </View>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent?: string;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.statCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={[styles.statIcon, { backgroundColor: (accent ?? colors.primary) + "22" }]}>
        {icon}
      </View>
      <Text style={[styles.statValue, { color: accent ?? colors.foreground }]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function ExpiringCertRow({ cert }: { cert: { name: string; expiresAt?: string | null; riskLevel: string } }) {
  const colors = useColors();
  const daysLeft = cert.expiresAt
    ? Math.max(0, Math.round((new Date(cert.expiresAt).getTime() - Date.now()) / 86400000))
    : null;
  const urgent = daysLeft !== null && daysLeft <= 14;
  return (
    <View style={[styles.certRow, { borderBottomColor: colors.border }]}>
      <View style={styles.certLeft}>
        <Feather name="shield" size={14} color={urgent ? colors.critical : colors.mutedForeground} />
        <Text style={[styles.certName, { color: colors.foreground }]} numberOfLines={1}>
          {cert.name}
        </Text>
      </View>
      {daysLeft !== null ? (
        <Text style={[styles.certDays, { color: urgent ? colors.critical : colors.warning }]}>
          {daysLeft}d
        </Text>
      ) : null}
    </View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const {
    data: summary,
    isLoading: loadingSummary,
    refetch: refetchSummary,
    isRefetching: refetchingSummary,
  } = useGetDashboardSummary();

  const {
    data: expiringCerts,
    isLoading: loadingCerts,
    refetch: refetchCerts,
  } = useGetExpiringCerts({ days: 30 });

  const isLoading = loadingSummary || loadingCerts;
  const isRefreshing = refetchingSummary;

  const onRefresh = () => {
    refetchSummary();
    refetchCerts();
  };

  const styles2 = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: topPad,
      paddingBottom: bottomPad,
    },
  });

  if (isLoading) {
    return (
      <View style={[styles2.container, styles.centered]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const riskScore = summary?.overallRiskScore ?? 0;
  const totalAssets = summary?.totalAssets ?? 0;
  const criticalFindings = summary?.criticalFindings ?? 0;
  const expiringCount = expiringCerts?.length ?? 0;

  return (
    <ScrollView
      style={styles2.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>CryptoGuard</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            Security Overview
          </Text>
        </View>
        <View style={[styles.riskBadgeContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.riskScoreLabel, { color: colors.mutedForeground }]}>Risk</Text>
          <Text
            style={[
              styles.riskScoreValue,
              {
                color:
                  riskScore >= 80
                    ? colors.critical
                    : riskScore >= 60
                    ? colors.high
                    : riskScore >= 40
                    ? colors.medium
                    : colors.success,
              },
            ]}
          >
            {riskScore}
          </Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <StatCard
          icon={<Feather name="box" size={20} color={colors.primary} />}
          label="Total Assets"
          value={totalAssets}
          accent={colors.primary}
        />
        <StatCard
          icon={<Feather name="alert-triangle" size={20} color={colors.critical} />}
          label="Critical"
          value={criticalFindings}
          accent={colors.critical}
        />
        <StatCard
          icon={
            <MaterialCommunityIcons
              name="shield-half-full"
              size={20}
              color={
                riskScore >= 80
                  ? colors.critical
                  : riskScore >= 60
                  ? colors.high
                  : colors.medium
              }
            />
          }
          label="Risk Score"
          value={riskScore}
          accent={
            riskScore >= 80
              ? colors.critical
              : riskScore >= 60
              ? colors.high
              : riskScore >= 40
              ? colors.medium
              : colors.success
          }
        />
        <StatCard
          icon={<Feather name="clock" size={20} color={colors.warning} />}
          label="Expiring (30d)"
          value={expiringCount}
          accent={expiringCount > 0 ? colors.warning : colors.mutedForeground}
        />
      </View>

      {expiringCerts && expiringCerts.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Feather name="clock" size={16} color={colors.warning} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Expiring Certificates
            </Text>
          </View>
          {expiringCerts.slice(0, 5).map((cert) => (
            <ExpiringCertRow key={cert.id} cert={cert} />
          ))}
          {expiringCerts.length > 5 && (
            <Text style={[styles.moreText, { color: colors.mutedForeground }]}>
              +{expiringCerts.length - 5} more
            </Text>
          )}
        </View>
      )}

      {summary && (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Feather name="activity" size={16} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Finding Breakdown
            </Text>
          </View>
          {[
            { label: "Critical", value: summary.criticalFindings, color: colors.critical },
            { label: "High", value: summary.highFindings, color: colors.high },
            { label: "Medium", value: summary.mediumFindings, color: colors.medium },
            { label: "Low", value: summary.lowFindings, color: colors.low },
          ].map((item) => (
            <View key={item.label} style={[styles.breakdownRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.breakdownLabel, { color: colors.mutedForeground }]}>
                {item.label}
              </Text>
              <Text style={[styles.breakdownValue, { color: item.color }]}>{item.value ?? 0}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  riskBadgeContainer: {
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  riskScoreLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  riskScoreValue: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    lineHeight: 32,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    lineHeight: 32,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  certRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  certLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  certName: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  certDays: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  moreText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingTop: 6,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  breakdownLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  breakdownValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
});
