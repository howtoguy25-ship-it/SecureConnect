import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import ProjectsScreen from '@/screens/ProjectsScreen';
import NewProjectScreen from '@/screens/NewProjectScreen';
import ThemeGalleryScreen from '@/screens/ThemeGalleryScreen';
import EditorScreen from '@/screens/EditorScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Projects" component={ProjectsScreen} />
        <Stack.Screen name="NewProject" component={NewProjectScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="ThemeGallery" component={ThemeGalleryScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="Editor" component={EditorScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
