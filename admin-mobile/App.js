import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

/** On-call companion: alerts, orders, customers only. Full CRUD lives in the web admin. */
const SCREEN_MODULE_KEYS = {
  Dashboard: null,
  Orders: "orders",
  Customers: "customers",
};

const allScreens = Object.keys(SCREEN_MODULE_KEYS);

const screenEndpoints = {
  Orders: "/admin/orders/",
  Customers: "/admin/customers/",
};

/** Valid next statuses for a given order status. */
const VALID_NEXT_STATUSES = {
  pending:    ["confirmed", "cancelled"],
  confirmed:  ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped:    ["delivered", "failed"],
  delivered:  ["returned", "refunded"],
  paid:       ["processing", "cancelled"],
  cancelled:  [],
  returned:   ["refunded"],
  refunded:   [],
  failed:     ["confirmed"],
};

function canViewScreen(screen, adminMe) {
  const moduleKey = SCREEN_MODULE_KEYS[screen];
  if (!moduleKey) {
    return true;
  }
  return Boolean(adminMe?.modules?.[moduleKey]?.view);
}

function unwrapListPayload(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && Array.isArray(data.results)) {
    return data.results;
  }
  return data;
}

export default function App() {
  const [activeScreen, setActiveScreen] = useState("Dashboard");
  const [accessToken, setAccessToken] = useState("");
  const [login, setLogin] = useState({ username: "", password: "" });
  const [adminMe, setAdminMe] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [screenData, setScreenData] = useState(null);
  const [pushToken, setPushToken] = useState("");
  const [visibleScreens, setVisibleScreens] = useState(["Dashboard"]);

  const buildHeaders = useCallback(
    (token = accessToken) => ({
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    }),
    [accessToken],
  );

  const authorizedFetch = useCallback(
    async (url, options = {}) => {
      let token = accessToken;
      let response = await fetch(url, {
        ...options,
        headers: { ...buildHeaders(token), ...(options.headers || {}) },
      });

      if (response.status !== 401) {
        return response;
      }

      const refresh = await AsyncStorage.getItem("refreshToken");
      if (!refresh) {
        return response;
      }

      const refreshResponse = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      if (!refreshResponse.ok) {
        return response;
      }

      const refreshData = await refreshResponse.json();
      token = refreshData.access;
      await AsyncStorage.setItem("accessToken", token);
      if (refreshData.refresh) {
        await AsyncStorage.setItem("refreshToken", refreshData.refresh);
      }
      setAccessToken(token);

      return fetch(url, {
        ...options,
        headers: { ...buildHeaders(token), ...(options.headers || {}) },
      });
    },
    [accessToken, buildHeaders],
  );

  useEffect(() => {
    AsyncStorage.getItem("accessToken").then((token) => {
      if (token) setAccessToken(token);
    });
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    authorizedFetch(`${API_BASE_URL}/admin/me/`)
      .then((response) => response.json())
      .then((data) => {
        setAdminMe(data);
        const vis = allScreens.filter((screen) => canViewScreen(screen, data));
        setVisibleScreens(vis);
        if (!vis.includes(activeScreen)) setActiveScreen("Dashboard");
      })
      .catch(() => setAdminMe(null));

    authorizedFetch(`${API_BASE_URL}/admin/dashboard/`)
      .then((response) => response.json())
      .then(setDashboard)
      .catch(() => setDashboard(null));
  }, [accessToken, authorizedFetch]);

  useEffect(() => {
    if (!accessToken || activeScreen === "Dashboard") return;
    const endpoint = screenEndpoints[activeScreen];
    if (!endpoint) return;
    setScreenData(null);
    authorizedFetch(`${API_BASE_URL}${endpoint}`)
      .then((response) => response.json())
      .then((data) => setScreenData(unwrapListPayload(data)))
      .catch(() => setScreenData({ error: "Unable to load data." }));
  }, [accessToken, activeScreen, authorizedFetch]);

  async function signIn() {
    const response = await fetch(`${API_BASE_URL}/auth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(login),
    });

    if (!response.ok) {
      Alert.alert("Login failed", "Check your staff credentials and try again.");
      return;
    }

    const data = await response.json();
    await AsyncStorage.setItem("accessToken", data.access);
    await AsyncStorage.setItem("refreshToken", data.refresh);
    setAccessToken(data.access);
    registerPushToken(data.access);
  }

  async function registerPushToken(token) {
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return;

    const expoToken = await Notifications.getExpoPushTokenAsync();
    setPushToken(expoToken.data);
    await fetch(`${API_BASE_URL}/notifications/devices/`, {
      method: "POST",
      headers: buildHeaders(token),
      body: JSON.stringify({ token: expoToken.data, platform: Platform.OS === "android" ? "android" : "ios" }),
    }).catch(() => {});
  }

  async function signOut() {
    const headers = buildHeaders();
    if (pushToken) {
      await fetch(`${API_BASE_URL}/notifications/devices/deactivate/`, {
        method: "POST",
        headers,
        body: JSON.stringify({ token: pushToken }),
      }).catch(() => {});
    }
    await AsyncStorage.multiRemove(["accessToken", "refreshToken"]);
    setAccessToken("");
    setAdminMe(null);
    setVisibleScreens(["Dashboard"]);
    setActiveScreen("Dashboard");
  }

  function renderScreenData() {
    if (activeScreen === "Dashboard") {
      return (
        <>
          <View style={styles.grid}>
            {[
              ["Revenue", dashboard?.revenue ?? "-"],
              ["Orders", dashboard?.orders ?? "-"],
              ["Pending", dashboard?.pending_orders ?? "-"],
              ["Low stock", dashboard?.low_stock ?? "-"],
            ].map(([label, value]) => (
              <View style={styles.metric} key={label}>
                <Text style={styles.metricLabel}>{label}</Text>
                <Text style={styles.metricValue}>{String(value)}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.sectionTitle}>Recent customers</Text>
          {(dashboard?.recent_customers || []).map((customer) => (
            <View style={styles.rowCard} key={customer.id}>
              <Text style={styles.rowTitle}>{customer.first_name || customer.username || "Customer"}</Text>
              <Text style={styles.rowMeta}>{customer.email || ""}</Text>
            </View>
          ))}
        </>
      );
    }

    if (!screenData) {
      return <Text style={styles.emptyText}>Loading {activeScreen.toLowerCase()}...</Text>;
    }

    if (screenData.error) {
      return <Text style={styles.emptyText}>{screenData.error}</Text>;
    }

    if (!Array.isArray(screenData)) {
      return (
        <View style={styles.empty}>
          {Object.entries(screenData).slice(0, 8).map(([key, value]) => (
            <Text style={styles.rowMeta} key={key}>{key}: {String(value)}</Text>
          ))}
        </View>
      );
    }

    if (!screenData.length) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No {activeScreen.toLowerCase()} yet</Text>
          <Text style={styles.emptyText}>When records are created, they will appear here.</Text>
        </View>
      );
    }

    const canEditOrders = Boolean(adminMe?.modules?.orders?.edit);

    return screenData.slice(0, 25).map((item, index) => {
      const title = item.order_number || item.name_en || item.code || item.email || item.username || item.product_name || `${activeScreen} item`;
      const status = item.status || item.payment_status || item.brand || item.customer_name || (item.is_approved !== undefined ? (item.is_approved ? "approved" : "pending") : "Ready");
      return (
        <View style={styles.rowCard} key={item.id || item.slug || item.order_number || index}>
          <Text style={styles.rowTitle}>{title}</Text>
          <Text style={styles.rowMeta}>Status: {status}</Text>
          {activeScreen === "Orders" && canEditOrders && item.order_number ? (() => {
            const currentStatus = String(item.status || "").toLowerCase();
            const nextStatuses = VALID_NEXT_STATUSES[currentStatus] || [];
            if (!nextStatuses.length) return null;
            return (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {nextStatuses.map((next) => (
                  <Pressable key={next} style={styles.actionBtn} onPress={() => updateOrderStatus(item.order_number, next)}>
                    <Text style={styles.actionBtnText}>{next.charAt(0).toUpperCase() + next.slice(1)}</Text>
                  </Pressable>
                ))}
              </View>
            );
          })() : null}
        </View>
      );
    });
  }

  async function updateOrderStatus(orderNumber, newStatus) {
    try {
      const res = await authorizedFetch(`${API_BASE_URL}/admin/orders/${orderNumber}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      const endpoint = screenEndpoints[activeScreen];
      const refreshRes = await authorizedFetch(`${API_BASE_URL}${endpoint}`);
      const data = await refreshRes.json();
      setScreenData(unwrapListPayload(data));
      Alert.alert("Success", `Order updated to ${newStatus}`);
    } catch (e) {
      Alert.alert("Error", "Could not update order.");
    }
  }

  if (!accessToken) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.loginCard}>
          <Text style={styles.kicker}>EnfhantOrganic Admin</Text>
          <Text style={styles.title}>Welcome back</Text>
          <TextInput style={styles.input} placeholder="Username" value={login.username} onChangeText={(username) => setLogin({ ...login, username })} />
          <TextInput style={styles.input} placeholder="Password" secureTextEntry value={login.password} onChangeText={(password) => setLogin({ ...login, password })} />
          <Pressable style={styles.primaryButton} onPress={signIn}>
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>Admin</Text>
        <Pressable onPress={signOut}>
          <Text style={styles.link}>Logout</Text>
        </Pressable>
      </View>
      <FlatList
        data={visibleScreens}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        renderItem={({ item }) => (
          <Pressable style={[styles.tab, activeScreen === item && styles.tabActive]} onPress={() => setActiveScreen(item)}>
            <Text style={[styles.tabText, activeScreen === item && styles.tabTextActive]}>{item}</Text>
          </Pressable>
        )}
        keyExtractor={(item) => item}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>{activeScreen}</Text>
        {renderScreenData()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f3ea" },
  loginCard: { margin: 24, marginTop: 72, padding: 24, borderRadius: 32, backgroundColor: "#fff" },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kicker: { color: "#5f7f4f", fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 },
  title: { color: "#191817", fontSize: 30, fontWeight: "800", marginBottom: 18 },
  input: { backgroundColor: "#fff", borderColor: "#eadfce", borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 12 },
  primaryButton: { backgroundColor: "#5f7f4f", padding: 16, borderRadius: 999, alignItems: "center", marginTop: 8 },
  primaryButtonText: { color: "#fff", fontWeight: "800" },
  link: { color: "#5f7f4f", fontWeight: "800" },
  tabs: { paddingHorizontal: 20, gap: 10, paddingVertical: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: "#fff" },
  tabActive: { backgroundColor: "#5f7f4f" },
  tabText: { color: "#191817", fontWeight: "700" },
  tabTextActive: { color: "#fff" },
  content: { padding: 20, paddingBottom: 48 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metric: { width: "47%", padding: 18, borderRadius: 24, backgroundColor: "#fff" },
  metricLabel: { color: "#6d675f", marginBottom: 8 },
  metricValue: { color: "#191817", fontSize: 26, fontWeight: "800" },
  empty: { padding: 24, borderRadius: 28, backgroundColor: "#fff" },
  emptyTitle: { fontSize: 22, fontWeight: "800", color: "#191817", marginBottom: 8 },
  emptyText: { color: "#6d675f", lineHeight: 22 },
  sectionTitle: { color: "#191817", fontSize: 18, fontWeight: "800", marginTop: 22, marginBottom: 10 },
  rowCard: { padding: 16, borderRadius: 22, backgroundColor: "#fff", marginBottom: 10 },
  rowTitle: { color: "#191817", fontSize: 16, fontWeight: "800", marginBottom: 4 },
  rowMeta: { color: "#6d675f", lineHeight: 20 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "#f0f3ed", alignSelf: "flex-start" },
  actionBtnText: { color: "#5f7f4f", fontSize: 13, fontWeight: "700" },
});
