import { Feather } from "@expo/vector-icons";
import {
  type Finding,
  useListFindings,
  useUpdateFinding,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

type Severity = "all" | "critical" | "high" | "medium" | "low";
type StatusFilter = "all" | "open" | "acknowledged" | "resolved";

const SEVERITY_FILTERS: { key: Severity; label: string }[] = [
  { key: "all", label: "All" },
  { key: "critical", label: "Critical" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
];

function SeverityBadge({ severity }: { severity: string }) {
  const colors = useColors();
  const map: Record<string, string> = {
    critical: colors.critical,
    high: colors.high,
    medium: colors.medium,
    low: colors.low,
    info: colors.info ?? colors.mutedForeground,
  };
  const color = map[severity] ?? colors.mutedForeground;
  return (
    <View style={[styles.badge, { backgroundColor: color + "22", borderColor: color + "66" }]}>
      <Text style={[styles.badgeText, { color }]}>{severity.toUpperCase()}</Text>
    </View>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors = useColors();
  const map: Record<string, { bg: string; text: string }> = {
    open: { bg: colors.critical + "22", text: colors.critical },
    acknowledged: { bg: colors.warning + "22", text: colors.warning },
    resolved: { bg: colors.success + "22", text: colors.success },
  };
  const style = map[status] ?? { bg: colors.muted, text: colors.mutedForeground };
  return (
    <View style={[styles.pill, { backgroundColor: style.bg }]}>
      <Text style={[styles.pillText, { color: style.text }]}>{status}</Text>
    </View>
  );
}

function FindingCard({ finding, onStatusChange }: { finding: Finding; onStatusChange: (id: number, status: string) => void }) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      testID={`finding-card-${finding.id}`}
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.8}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.cardHeader}>
        <SeverityBadge severity={finding.severity} />
        <StatusPill status={finding.status} />
      </View>
      <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={expanded ? undefined : 2}>
        {finding.title}
      </Text>
      <Text style={[styles.cardEnv, { color: colors.mutedForeground }]}>
        <Feather name="layers" size={11} /> {finding.environmentName ?? "Unknown"}
      </Text>

      {expanded && (
        <View style={styles.expandedSection}>
          {finding.description ? (
            <Text style={[styles.description, { color: colors.mutedForeground }]}>
              {finding.description}
            </Text>
          ) : null}
          {finding.remediationAdvice ? (
            <View style={[styles.remediationBox, { backgroundColor: colors.primary + "11", borderColor: colors.primary + "33" }]}>
              <Text style={[styles.remediationLabel, { color: colors.primary }]}>Remediation</Text>
              <Text style={[styles.remediationText, { color: colors.foreground }]}>
                {finding.remediationAdvice}
              </Text>
            </View>
          ) : null}

          <View style={styles.actionRow}>
            {finding.status !== "acknowledged" && finding.status !== "resolved" && (
              <TouchableOpacity
                testID={`acknowledge-${finding.id}`}
                style={[styles.actionBtn, { backgroundColor: colors.warning + "22", borderColor: colors.warning + "55" }]}
                onPress={() => onStatusChange(finding.id, "acknowledged")}
              >
                <Feather name="eye" size={13} color={colors.warning} />
                <Text style={[styles.actionBtnText, { color: colors.warning }]}>Acknowledge</Text>
              </TouchableOpacity>
            )}
            {finding.status !== "resolved" && (
              <TouchableOpacity
                testID={`resolve-${finding.id}`}
                style={[styles.actionBtn, { backgroundColor: colors.success + "22", borderColor: colors.success + "55" }]}
                onPress={() => onStatusChange(finding.id, "resolved")}
              >
                <Feather name="check-circle" size={13} color={colors.success} />
                <Text style={[styles.actionBtnText, { color: colors.success }]}>Resolve</Text>
              </TouchableOpacity>
            )}
            {finding.status === "resolved" && (
              <TouchableOpacity
                testID={`reopen-${finding.id}`}
                style={[styles.actionBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
                onPress={() => onStatusChange(finding.id, "open")}
              >
                <Feather name="refresh-cw" size={13} color={colors.mutedForeground} />
                <Text style={[styles.actionBtnText, { color: colors.mutedForeground }]}>Reopen</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function FindingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [severityFilter, setSeverityFilter] = useState<Severity>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");

  const { data: findings, isLoading, refetch, isRefetching } = useListFindings({
    severity: severityFilter === "all" ? undefined : severityFilter,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const { mutate: updateFinding } = useUpdateFinding();

  const handleStatusChange = (id: number, newStatus: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateFinding(
      { id, data: { status: newStatus as "open" | "acknowledged" | "resolved" } },
      {
        onSuccess: () => refetch(),
        onError: () =>
          Alert.alert("Error", "Failed to update finding status."),
      }
    );
  };

  const containerStyle = {
    flex: 1 as const,
    backgroundColor: colors.background,
    paddingTop: topPad,
    paddingBottom: Platform.OS === "web" ? 34 : 0,
  };

  return (
    <View style={containerStyle}>
      <View style={[styles.pageHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>Findings</Text>
        <Text style={[styles.pageCount, { color: colors.mutedForeground }]}>
          {findings?.length ?? 0} results
        </Text>
      </View>

      <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
        <FlatList
          horizontal
          data={SEVERITY_FILTERS}
          keyExtractor={(item) => item.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => {
            const active = severityFilter === item.key;
            return (
              <TouchableOpacity
                testID={`filter-${item.key}`}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSeverityFilter(item.key);
                }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.primary + "22" : colors.muted,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: active ? colors.primary : colors.mutedForeground },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <View style={[styles.statusRow, { borderBottomColor: colors.border }]}>
        {(["all", "open", "acknowledged", "resolved"] as StatusFilter[]).map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => {
              Haptics.selectionAsync();
              setStatusFilter(s);
            }}
            style={[
              styles.statusChip,
              statusFilter === s && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
          >
            <Text
              style={[
                styles.statusChipText,
                { color: statusFilter === s ? colors.primary : colors.mutedForeground },
              ]}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={findings ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!(findings && findings.length > 0)}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="check-circle" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No findings</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No findings match the current filters
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <FindingCard finding={item} onStatusChange={handleStatusChange} />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  filterBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterList: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  statusRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statusChip: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  statusChipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  listContent: {
    padding: 12,
    gap: 10,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  cardEnv: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pillText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  expandedSection: {
    gap: 10,
    marginTop: 4,
  },
  description: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  remediationBox: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  remediationLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  remediationText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
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
