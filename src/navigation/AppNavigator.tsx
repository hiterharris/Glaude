import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../types';

import LoginScreen from '../screens/LoginScreen';
import RepoListScreen from '../screens/RepoListScreen';
import FileBrowserScreen from '../screens/FileBrowserScreen';
import PromptScreen from '../screens/PromptScreen';
import DiffReviewScreen from '../screens/DiffReviewScreen';
import CommitScreen from '../screens/CommitScreen';
import CommitSuccessScreen from '../screens/CommitSuccessScreen';
import RepoAIScreen from '../screens/RepoAIScreen';

const Stack = createStackNavigator<RootStackParamList>();

const NavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0d1117',
    card: '#161b22',
    text: '#e6edf3',
    border: '#30363d',
    primary: '#58a6ff',
    notification: '#58a6ff',
  },
};

const screenOptions = {
  headerStyle: { backgroundColor: '#161b22' },
  headerTintColor: '#e6edf3',
  headerTitleStyle: { fontWeight: '600' as const, fontSize: 16 },
  cardStyle: { backgroundColor: '#0d1117' },
};

const AppNavigator: React.FC = () => {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#58a6ff" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={NavTheme}>
      <Stack.Navigator screenOptions={screenOptions}>
        {token ? (
          <>
            <Stack.Screen
              name="RepoList"
              component={RepoListScreen}
              options={{ title: 'Glaude — Repositories' }}
            />
            <Stack.Screen
              name="FileBrowser"
              component={FileBrowserScreen}
              options={({ route }) => ({ title: route.params.repo.name })}
            />
            <Stack.Screen
              name="RepoAI"
              component={RepoAIScreen}
              options={{ title: 'AI Global Edit' }}
            />
            <Stack.Screen
              name="Prompt"
              component={PromptScreen}
              options={({ route }) => ({
                title: route.params.file.path.split('/').pop() ?? 'Edit',
              })}
            />
            <Stack.Screen
              name="DiffReview"
              component={DiffReviewScreen}
              options={{ title: 'Review Changes' }}
            />
            <Stack.Screen
              name="Commit"
              component={CommitScreen}
              options={{ title: 'Committing…', headerBackVisible: false }}
            />
            <Stack.Screen
              name="CommitSuccess"
              component={CommitSuccessScreen}
              options={{ title: 'Committed', headerBackVisible: false }}
            />
          </>
        ) : (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: '#0d1117',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AppNavigator;
