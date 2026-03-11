import React from "react"
import { NavigationContainer } from "@react-navigation/native"
import { createStackNavigator } from "@react-navigation/stack"
import { ActivityIndicator, View, StyleSheet } from "react-native"

import Signup from "../screens/SignupScreen"
import Login from "../screens/LoginScreen"
import Chat from "../screens/ChatScreen"
import Upload from "../screens/AdminUploadScreen"

// CHANGE: Import AuthProvider and useAuth hook
import { AuthProvider, useAuth } from "../contexts/AuthContext"

const Stack = createStackNavigator()

// CHANGE: Created separate navigator component to use auth context
function AppNavigatorContent() {
  const { isAuthenticated, loading, user } = useAuth();

  // CHANGE: Show loading screen while checking authentication status
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4A90E2" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          // CHANGE: Show auth screens if not authenticated
          <>
            <Stack.Screen name="Login" component={Login} />
            <Stack.Screen name="Signup" component={Signup} />
          </>
        ) : (
          // CHANGE: Show app screens based on user role if authenticated
          <>
            {user?.role === 'admin' ? (
              <>
                <Stack.Screen 
                  name="AdminUpload" 
                  component={Upload}
                  initialParams={{ user }}
                />
                <Stack.Screen 
                  name="Chat" 
                  component={Chat}
                  initialParams={{ user }}
                />
              </>
            ) : (
              <Stack.Screen 
                name="Chat" 
                component={Chat}
                initialParams={{ user }}
              />
            )}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// CHANGE: Wrap navigator with AuthProvider
export default function AppNavigator() {
  return (
    <AuthProvider>
      <AppNavigatorContent />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
});