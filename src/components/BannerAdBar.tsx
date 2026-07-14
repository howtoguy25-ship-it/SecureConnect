import { View, StyleSheet } from "react-native";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { env } from "@/config/env";

// A persistent strip reserved at the very bottom of the screen, outside the map's own
// layout -- see MapScreen.tsx, which only renders this when NOT navigating, and gives it its
// own flex row below the map rather than floating it over the map/controls. That keeps it
// physically incapable of ever overlapping the route, turn instructions, or FAB buttons,
// including while actively driving.
export function BannerAdBar() {
  return (
    <View style={styles.container}>
      <BannerAd
        unitId={env.ads.bannerUnitId}
        size={BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER}
        onAdFailedToLoad={(error) => console.warn("[ads] banner failed to load", error)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});
