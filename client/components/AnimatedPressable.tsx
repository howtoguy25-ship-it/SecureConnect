import React, { useCallback } from "react";
import { Pressable, PressableProps, ViewStyle, StyleProp } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  WithSpringConfig,
} from "react-native-reanimated";
import { haptics } from "@/lib/haptics";

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

const springConfig: WithSpringConfig = {
  damping: 15,
  mass: 0.4,
  stiffness: 200,
  overshootClamping: false,
};

interface AnimatedPressableProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  scaleValue?: number;
  enableHaptics?: boolean;
  hapticType?: "light" | "medium" | "selection";
  children?: React.ReactNode;
}

export function AnimatedPressable({
  style,
  scaleValue = 0.97,
  enableHaptics = true,
  hapticType = "light",
  onPressIn,
  onPressOut,
  onPress,
  children,
  ...props
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(
    (e: any) => {
      scale.value = withSpring(scaleValue, springConfig);
      if (enableHaptics) {
        haptics[hapticType]();
      }
      onPressIn?.(e);
    },
    [scaleValue, enableHaptics, hapticType, onPressIn]
  );

  const handlePressOut = useCallback(
    (e: any) => {
      scale.value = withSpring(1, springConfig);
      onPressOut?.(e);
    },
    [onPressOut]
  );

  return (
    <AnimatedPressableBase
      {...props}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      style={[animatedStyle, style as any]}
    >
      {children}
    </AnimatedPressableBase>
  );
}
