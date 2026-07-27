import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, StyleSheet, FlatList, Pressable, Image, ActivityIndicator, Alert, Platform, Linking, ScrollView, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { getSocket, connectSocket } from "@/lib/socket";

let MapView: any = null;
let Marker: any = null;
let Callout: any = null;
try {
  const maps = require("react-native-maps");
  MapView = maps.default;
  Marker = maps.Marker;
  Callout = maps.Callout;
} catch (e) {}

interface LocationRequest {
  id: string;
  requesterId: string;
  targetId: string;
  status: string;
  createdAt: string;
  requester?: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

interface FriendLocation {
  id: string;
  userId: string;
  latitude: string;
  longitude: string;
  isSharing: boolean;
  lastUpdated: string;
  user?: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

interface Friend {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

const DEFAULT_REGION = {
  latitude: 37.78825,
  longitude: -122.4324,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function LocationScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { theme, isDark } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { width: screenWidth } = useWindowDimensions();
  const mapRef = useRef<any>(null);

  const [isSharing, setIsSharing] = useState(false);
  const [locationPermission, setLocationPermission] = useState<Location.PermissionStatus | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);

  const isVip = user?.isVip;
  const mapAvailable = MapView !== null && Platform.OS !== "web";

  const { data: locationRequests = [] } = useQuery<LocationRequest[]>({
    queryKey: ["/api/location/requests"],
    enabled: !!isVip,
  });

  const { data: friendLocations = [] } = useQuery<FriendLocation[]>({
    queryKey: ["/api/location/friends"],
    enabled: !!isVip,
    refetchInterval: 15000,
  });

  const { data: friends = [] } = useQuery<Friend[]>({
    queryKey: ["/api/friends"],
    enabled: !!isVip,
  });

  const { data: myLocationShare } = useQuery<{ isSharing: boolean } | null>({
    queryKey: ["/api/location/me"],
    enabled: !!isVip,
  });

  useEffect(() => {
    if (myLocationShare) {
      setIsSharing(myLocationShare.isSharing);
    }
  }, [myLocationShare]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status);
      if (status === "granted") {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setCurrentLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        } catch (e) {}
      }
    })();
  }, []);

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;

    if (isSharing && locationPermission === "granted" && isVip) {
      (async () => {
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 10000,
            distanceInterval: 10,
          },
          (location) => {
            setCurrentLocation({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });
            updateLocationMutation.mutate({
              latitude: location.coords.latitude.toString(),
              longitude: location.coords.longitude.toString(),
            });
          }
        );
      })();
    }

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [isSharing, locationPermission, isVip]);

  useEffect(() => {
    if (!isVip || !user) return;

    let socket = getSocket();
    let mounted = true;

    const setupSocket = async () => {
      if (!socket) {
        try {
          socket = await connectSocket();
        } catch {
          return;
        }
      }

      const handleFriendLocationUpdate = (data: {
        userId: string;
        latitude: string;
        longitude: string;
        displayName: string | null;
        avatarUrl: string | null;
        lastUpdated: string;
        isSharing: boolean;
      }) => {
        if (!mounted) return;
        queryClient.setQueryData<FriendLocation[]>(["/api/location/friends"], (old) => {
          if (!old) return old;
          const existing = old.find(f => f.userId === data.userId);
          if (existing) {
            return old.map(f =>
              f.userId === data.userId
                ? { ...f, latitude: data.latitude, longitude: data.longitude, lastUpdated: data.lastUpdated, isSharing: data.isSharing }
                : f
            );
          }
          return [...old, {
            id: data.userId,
            userId: data.userId,
            latitude: data.latitude,
            longitude: data.longitude,
            isSharing: data.isSharing,
            lastUpdated: data.lastUpdated,
            user: { id: data.userId, displayName: data.displayName, avatarUrl: data.avatarUrl },
          }];
        });
      };

      const handleLocationSharingEnabled = () => {
        if (!mounted) return;
        setIsSharing(true);
        queryClient.invalidateQueries({ queryKey: ["/api/location/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/location/friends"] });
      };

      const handleLocationRequestAccepted = (data: { acceptedByName?: string }) => {
        if (!mounted) return;
        queryClient.invalidateQueries({ queryKey: ["/api/location/friends"] });
        queryClient.invalidateQueries({ queryKey: ["/api/location/requests"] });
        Alert.alert("Location Shared", `${data.acceptedByName || "Your friend"} accepted your location request. You can now see each other's live location.`);
      };

      socket.on('friend-location-update', handleFriendLocationUpdate);
      socket.on('location-sharing-enabled', handleLocationSharingEnabled);
      socket.on('location-request-accepted', handleLocationRequestAccepted);

      return () => {
        socket?.off('friend-location-update', handleFriendLocationUpdate);
        socket?.off('location-sharing-enabled', handleLocationSharingEnabled);
        socket?.off('location-request-accepted', handleLocationRequestAccepted);
      };
    };

    const cleanup = setupSocket();

    return () => {
      mounted = false;
      cleanup.then(fn => fn?.());
    };
  }, [isVip, user?.id, queryClient]);

  const updateLocationMutation = useMutation({
    mutationFn: async (data: { latitude: string; longitude: string }) => {
      return apiRequest("POST", "/api/location/update", data);
    },
  });

  const toggleSharingMutation = useMutation({
    mutationFn: async (sharing: boolean) => {
      return apiRequest("POST", "/api/location/toggle", { isSharing: sharing });
    },
    onSuccess: (_, sharing) => {
      setIsSharing(sharing);
      queryClient.invalidateQueries({ queryKey: ["/api/location/me"] });
    },
  });

  const requestLocationMutation = useMutation({
    mutationFn: async (targetId: string) => {
      return apiRequest("POST", "/api/location/request", { targetId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location/requests"] });
      Alert.alert("Request Sent", "Your location request has been sent.");
    },
  });

  const respondToRequestMutation = useMutation({
    mutationFn: async ({ requestId, accept }: { requestId: string; accept: boolean }) => {
      return apiRequest("POST", `/api/location/requests/${requestId}/respond`, { accept });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/location/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/location/friends"] });
    },
  });

  const pendingRequests = locationRequests.filter(r => r.status === "pending" && r.targetId === user?.id);

  const focusOnFriend = useCallback((friendLoc: FriendLocation) => {
    setSelectedFriendId(friendLoc.userId);
    setShowMap(true);
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: parseFloat(friendLoc.latitude),
        longitude: parseFloat(friendLoc.longitude),
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 800);
    }
  }, []);

  const focusOnMe = useCallback(() => {
    setSelectedFriendId(null);
    if (mapRef.current && currentLocation) {
      mapRef.current.animateToRegion({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 800);
    }
  }, [currentLocation]);

  const fitAllMarkers = useCallback(() => {
    if (!mapRef.current) return;
    const coords: Array<{ latitude: number; longitude: number }> = [];
    if (currentLocation) {
      coords.push(currentLocation);
    }
    friendLocations.forEach(fl => {
      if (fl.latitude && fl.longitude) {
        coords.push({
          latitude: parseFloat(fl.latitude),
          longitude: parseFloat(fl.longitude),
        });
      }
    });
    if (coords.length > 0) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }
  }, [currentLocation, friendLocations]);

  const openInMaps = (latitude: string, longitude: string, name: string) => {
    const url = Platform.select({
      ios: `maps:0,0?q=${name}@${latitude},${longitude}`,
      android: `geo:0,0?q=${latitude},${longitude}(${name})`,
      default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
    });
    if (url) Linking.openURL(url);
  };

  const getTimeAgo = (dateStr: string) => {
    const now = new Date();
    const then = new Date(dateStr);
    const diffMs = now.getTime() - then.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  };

  const getMapRegion = () => {
    if (selectedFriendId) {
      const fl = friendLocations.find(f => f.userId === selectedFriendId);
      if (fl) {
        return {
          latitude: parseFloat(fl.latitude),
          longitude: parseFloat(fl.longitude),
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        };
      }
    }
    if (currentLocation) {
      return {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    if (friendLocations.length > 0) {
      return {
        latitude: parseFloat(friendLocations[0].latitude),
        longitude: parseFloat(friendLocations[0].longitude),
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    return DEFAULT_REGION;
  };

  if (!isVip) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.content, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.vipRequired}>
            <View style={[styles.vipIconLarge, { backgroundColor: theme.accent }]}>
              <Feather name="award" size={48} color="#fff" />
            </View>
            <ThemedText type="h2" style={styles.vipTitle}>
              VIP
            </ThemedText>
            <ThemedText type="body" style={[styles.vipText, { color: theme.textSecondary }]}>
              Real-time location sharing is an exclusive VIP feature. Upgrade to share your location with friends and see where they are.
            </ThemedText>
            <Button
              onPress={() => (navigation as any).navigate("VipUpgrade")}
              style={{ marginTop: Spacing.xl }}
            >
              Unlock VIP
            </Button>
          </View>
        </View>
      </ThemedView>
    );
  }

  const mapHeight = Math.min(screenWidth * 0.6, 300);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <ThemedText type="h2">Location</ThemedText>
            <View style={{ flexDirection: "row", gap: Spacing.sm, alignItems: "center" }}>
              {mapAvailable ? (
                <Pressable
                  style={[styles.mapToggle, { backgroundColor: showMap ? theme.primary : theme.backgroundDefault }]}
                  onPress={() => setShowMap(!showMap)}
                >
                  <Feather name={showMap ? "map" : "list"} size={16} color={showMap ? "#fff" : theme.text} />
                </Pressable>
              ) : null}
              <View style={[styles.vipBadge, { backgroundColor: theme.accent }]}>
                <Feather name="award" size={16} color="#fff" />
                <ThemedText type="small" style={{ color: "#fff" }}>VIP</ThemedText>
              </View>
            </View>
          </View>

          {showMap && mapAvailable ? (
            <View style={[styles.mapContainer, { height: mapHeight, borderColor: theme.backgroundTertiary }]}>
              <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={getMapRegion()}
                showsUserLocation={locationPermission === "granted"}
                showsMyLocationButton={false}
                userInterfaceStyle={isDark ? "dark" : "light"}
              >
                {friendLocations.map((fl) => (
                  <Marker
                    key={fl.userId}
                    coordinate={{
                      latitude: parseFloat(fl.latitude),
                      longitude: parseFloat(fl.longitude),
                    }}
                    title={fl.user?.displayName || "Friend"}
                    description={`Updated ${getTimeAgo(fl.lastUpdated)}`}
                    onPress={() => setSelectedFriendId(fl.userId)}
                  >
                    <View style={styles.markerContainer}>
                      <View style={[styles.markerBubble, {
                        backgroundColor: selectedFriendId === fl.userId ? theme.accent : theme.primary,
                      }]}>
                        {fl.user?.avatarUrl ? (
                          <Image source={{ uri: fl.user.avatarUrl }} style={styles.markerAvatar} />
                        ) : (
                          <ThemedText type="small" style={{ color: "#fff", fontWeight: "700" }}>
                            {fl.user?.displayName?.charAt(0) || "?"}
                          </ThemedText>
                        )}
                      </View>
                      <View style={[styles.markerArrow, {
                        borderTopColor: selectedFriendId === fl.userId ? theme.accent : theme.primary,
                      }]} />
                      <View style={[styles.markerPulse, {
                        backgroundColor: fl.isSharing ? theme.success + "40" : theme.textSecondary + "30",
                      }]} />
                    </View>
                    {Callout ? (
                      <Callout tooltip>
                        <View style={[styles.calloutContainer, { backgroundColor: theme.backgroundDefault }]}>
                          <ThemedText type="body" style={{ fontWeight: "600" }}>
                            {fl.user?.displayName || "Friend"}
                          </ThemedText>
                          <ThemedText type="small" style={{ color: theme.textSecondary }}>
                            {fl.isSharing ? "Sharing live" : "Last known"} - {getTimeAgo(fl.lastUpdated)}
                          </ThemedText>
                          <Pressable
                            style={[styles.calloutButton, { backgroundColor: theme.primary }]}
                            onPress={() => openInMaps(fl.latitude, fl.longitude, fl.user?.displayName || "Friend")}
                          >
                            <ThemedText type="small" style={{ color: "#fff" }}>Open in Maps</ThemedText>
                          </Pressable>
                        </View>
                      </Callout>
                    ) : null}
                  </Marker>
                ))}
              </MapView>

              <View style={styles.mapOverlay}>
                {currentLocation ? (
                  <Pressable
                    style={[styles.mapButton, { backgroundColor: theme.backgroundDefault }]}
                    onPress={focusOnMe}
                  >
                    <Feather name="crosshair" size={18} color={theme.primary} />
                  </Pressable>
                ) : null}
                {friendLocations.length > 0 ? (
                  <Pressable
                    style={[styles.mapButton, { backgroundColor: theme.backgroundDefault }]}
                    onPress={fitAllMarkers}
                  >
                    <Feather name="maximize" size={18} color={theme.primary} />
                  </Pressable>
                ) : null}
              </View>

              {friendLocations.length === 0 && !currentLocation ? (
                <View style={styles.mapEmptyOverlay}>
                  <View style={[styles.mapEmptyCard, { backgroundColor: theme.backgroundDefault + "E6" }]}>
                    <Feather name="map-pin" size={24} color={theme.textSecondary} />
                    <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>
                      No friends sharing yet. Request a friend's location below.
                    </ThemedText>
                  </View>
                </View>
              ) : null}
            </View>
          ) : !mapAvailable && (friendLocations.length > 0 || currentLocation) ? (
            <View style={[styles.webMapFallback, { backgroundColor: theme.backgroundDefault }]}>
              <Feather name="map" size={32} color={theme.textSecondary} />
              <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
                Open the app on your phone to see the live map
              </ThemedText>
            </View>
          ) : null}

          <View style={[styles.sharingToggle, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.sharingInfo}>
              <Feather name="navigation" size={24} color={isSharing ? theme.success : theme.textSecondary} />
              <View style={{ flex: 1 }}>
                <ThemedText type="body">Share My Location</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={1}>
                  {isSharing ? "Visible to accepted friends" : "Your location is private"}
                </ThemedText>
              </View>
            </View>
            <Pressable
              style={[
                styles.toggleButton,
                { backgroundColor: isSharing ? theme.success : theme.backgroundTertiary },
              ]}
              onPress={() => toggleSharingMutation.mutate(!isSharing)}
            >
              <View
                style={[
                  styles.toggleKnob,
                  { transform: [{ translateX: isSharing ? 20 : 0 }] },
                ]}
              />
            </Pressable>
          </View>

          {pendingRequests.length > 0 ? (
            <View style={styles.section}>
              <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                Pending Requests
              </ThemedText>
              {pendingRequests.map((item) => (
                <View key={item.id} style={[styles.requestCard, { backgroundColor: theme.backgroundDefault }]}>
                  <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
                    {item.requester?.avatarUrl ? (
                      <Image source={{ uri: item.requester.avatarUrl }} style={styles.avatarImage} />
                    ) : (
                      <ThemedText type="body" style={{ color: "#fff" }}>
                        {item.requester?.displayName?.charAt(0) || "?"}
                      </ThemedText>
                    )}
                  </View>
                  <View style={styles.requestInfo}>
                    <ThemedText type="body">
                      {item.requester?.displayName || "Someone"} wants to see your location
                    </ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </ThemedText>
                  </View>
                  <View style={styles.requestActions}>
                    <Pressable
                      style={[styles.actionButton, { backgroundColor: theme.success }]}
                      onPress={() => respondToRequestMutation.mutate({ requestId: item.id, accept: true })}
                    >
                      <Feather name="check" size={20} color="#fff" />
                    </Pressable>
                    <Pressable
                      style={[styles.actionButton, { backgroundColor: theme.error }]}
                      onPress={() => respondToRequestMutation.mutate({ requestId: item.id, accept: false })}
                    >
                      <Feather name="x" size={20} color="#fff" />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {friendLocations.length > 0 ? (
            <View style={styles.section}>
              <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                Friends Sharing Location
              </ThemedText>
              {friendLocations.map((item) => (
                <Pressable
                  key={item.id}
                  style={[
                    styles.locationCard,
                    { backgroundColor: theme.backgroundDefault },
                    selectedFriendId === item.userId ? { borderColor: theme.primary, borderWidth: 2 } : null,
                  ]}
                  onPress={() => {
                    if (mapAvailable) {
                      focusOnFriend(item);
                    } else {
                      openInMaps(item.latitude, item.longitude, item.user?.displayName || "Friend");
                    }
                  }}
                >
                  <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
                    {item.user?.avatarUrl ? (
                      <Image source={{ uri: item.user.avatarUrl }} style={styles.avatarImage} />
                    ) : (
                      <ThemedText type="body" style={{ color: "#fff" }}>
                        {item.user?.displayName?.charAt(0) || "?"}
                      </ThemedText>
                    )}
                  </View>
                  <View style={styles.locationInfo}>
                    <ThemedText type="body" style={{ fontWeight: "600" }}>
                      {item.user?.displayName || "Unknown"}
                    </ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      {getTimeAgo(item.lastUpdated)}
                    </ThemedText>
                  </View>
                  <View style={[styles.liveIndicator, { backgroundColor: item.isSharing ? theme.success : theme.textSecondary }]}>
                    <ThemedText type="small" style={{ color: "#fff", fontWeight: "600", fontSize: 10 }}>
                      {item.isSharing ? "LIVE" : "OFFLINE"}
                    </ThemedText>
                  </View>
                  <Pressable
                    onPress={() => openInMaps(item.latitude, item.longitude, item.user?.displayName || "Friend")}
                    hitSlop={8}
                  >
                    <Feather name="external-link" size={20} color={theme.primary} />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.section}>
            <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              Request Location From Friends
            </ThemedText>
            {friends.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="users" size={32} color={theme.textSecondary} />
                <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>
                  Add friends to request their location
                </ThemedText>
              </View>
            ) : (
              friends.filter(f => !friendLocations.some(fl => fl.userId === f.id)).map((item) => (
                <Pressable
                  key={item.id}
                  style={[styles.friendCard, { backgroundColor: theme.backgroundDefault }]}
                  onPress={() => requestLocationMutation.mutate(item.id)}
                >
                  <View style={[styles.avatarSmall, { backgroundColor: theme.primary }]}>
                    {item.avatarUrl ? (
                      <Image source={{ uri: item.avatarUrl }} style={styles.avatarImageSmall} />
                    ) : (
                      <ThemedText type="body" style={{ color: "#fff", fontSize: 14 }}>
                        {item.displayName?.charAt(0) || "?"}
                      </ThemedText>
                    )}
                  </View>
                  <ThemedText type="body" style={{ flex: 1 }}>
                    {item.displayName || "Unknown"}
                  </ThemedText>
                  <View style={[styles.requestButtonSmall, { backgroundColor: theme.primary }]}>
                    <ThemedText type="small" style={{ color: "#fff" }}>Request</ThemedText>
                  </View>
                </Pressable>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  vipBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  mapToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  mapContainer: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.lg,
    borderWidth: 1,
  },
  map: {
    flex: 1,
  },
  mapOverlay: {
    position: "absolute",
    right: Spacing.sm,
    bottom: Spacing.sm,
    gap: Spacing.xs,
  },
  mapButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  mapEmptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  mapEmptyCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    gap: Spacing.sm,
    maxWidth: 200,
  },
  webMapFallback: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  markerContainer: {
    alignItems: "center",
  },
  markerBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  markerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  markerArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
  },
  markerPulse: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 2,
  },
  calloutContainer: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    minWidth: 150,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  calloutButton: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
  vipRequired: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing["2xl"],
  },
  vipIconLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  vipTitle: {
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  vipText: {
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: Spacing.lg,
  },
  sharingToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xl,
  },
  sharingInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  toggleButton: {
    width: 50,
    height: 30,
    borderRadius: 15,
    padding: 2,
  },
  toggleKnob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#fff",
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  requestCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImageSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  requestInfo: {
    flex: 1,
  },
  requestActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  locationInfo: {
    flex: 1,
  },
  liveIndicator: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  requestButtonSmall: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  emptyState: {
    padding: Spacing.xl,
    alignItems: "center",
  },
});
