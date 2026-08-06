import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Marker } from "react-native-maps";
import { ALERT_COLORS, type AlertDoc } from "@/types/alert";
import { AlertTypeGlyph } from "@/components/AlertTypeGlyph";

interface Props {
  alert: AlertDoc;
  onPress: (alert: AlertDoc) => void;
}

// Memoized so MapScreen re-renders (e.g. every GPS tick, which changes currentLatLng but not
// the alerts list itself) don't cascade into reconciling every marker on screen -- onPress is
// already a stable useCallback([]) from MapScreen (onMarkerPress), so only a real change to
// this specific alert actually re-renders it.
// Fixed layout numbers (not measured at runtime) for the optional comment caption below the pin
// -- see the `anchor` comment on the Marker itself for why these need to be exact constants
// rather than whatever the comment's own text happens to lay out to.
const PIN_SIZE = 34;
const COMMENT_GAP = 3;
const COMMENT_HEIGHT = 30;

export const AlertMarker = React.memo(function AlertMarker({ alert, onPress }: Props) {
  // react-native-maps anchors a Marker's geographic coordinate to a FRACTION of its own
  // rendered content box (default {x:0.5, y:1}, i.e. bottom-center) -- which was fine when the
  // pin circle was the marker's only content, but a comment caption stacked below it (per
  // explicit request: "small... placed under the alert") would grow that content box downward,
  // and with the default anchor unchanged the coordinate would then point at the bottom of the
  // CAPTION instead of the bottom of the pin -- silently shifting every alert with a comment
  // away from where it was actually reported, exactly the class of bug already root-caused and
  // fixed once this session for the placement pin itself. Computed here instead from the real,
  // fixed pixel sizes above (not measured after layout, which react-native-maps has no hook for
  // anyway) so the pin's own bottom edge -- not the caption's -- stays the true anchor point
  // regardless of whether this alert has a comment.
  const anchor = alert.comment
    ? { x: 0.5, y: PIN_SIZE / (PIN_SIZE + COMMENT_GAP + COMMENT_HEIGHT) }
    : { x: 0.5, y: 1 };
  return (
    <Marker
      coordinate={{ latitude: alert.lat, longitude: alert.lng }}
      anchor={anchor}
      // react-native-maps fires MapView's own onPress *in addition to* a tapped Marker's onPress
      // on the same touch (confirmed native iOS behavior, same class of issue already worked
      // around for the speed-camera cluster markers) -- without stopping it here, tapping an
      // alert also ran MapScreen's onMapPress Places lookup for whatever's directly underneath,
      // opening the street/POI info sheet on top of this alert's own detail sheet a moment
      // later. Real, confirmed root cause of "tapping an alert also shows the street" -- this
      // stops the tap here so only the alert's own sheet ever opens.
      onPress={(e) => {
        e.stopPropagation();
        onPress(alert);
      }}
      tracksViewChanges={false}
    >
      <View style={styles.column}>
        <View style={[styles.pin, { backgroundColor: ALERT_COLORS[alert.type] }]}>
          <AlertTypeGlyph type={alert.type} size={18} color="#FFFFFF" />
        </View>
        {/* Small, semi-transparent (not fully opaque, not so transparent it's hard to read --
            per explicit request) caption directly under the pin. Fixed height regardless of the
            actual text (see COMMENT_HEIGHT above) so the anchor math above stays exact; up to 2
            lines is comfortably enough room for the 7-word cap this is limited to (see
            commentFilter.ts). */}
        {alert.comment && (
          <View style={styles.commentWrap}>
            <View style={styles.commentBubble}>
              <Text style={styles.commentText} numberOfLines={2}>
                {alert.comment}
              </Text>
            </View>
          </View>
        )}
      </View>
    </Marker>
  );
});

const styles = StyleSheet.create({
  column: {
    alignItems: "center",
  },
  pin: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  commentWrap: {
    marginTop: COMMENT_GAP,
    height: COMMENT_HEIGHT,
    justifyContent: "center",
  },
  commentBubble: {
    maxWidth: 140,
    // Semi-transparent -- not fully opaque, not so see-through it's hard to read against a
    // busy map background -- per explicit request ("transparent but not too transparent... very
    // easy for users to read").
    backgroundColor: "rgba(17, 24, 39, 0.72)",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  commentText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "600",
    textAlign: "center",
  },
});
