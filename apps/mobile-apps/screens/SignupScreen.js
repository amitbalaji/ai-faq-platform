import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';

export default function SignupScreen({ navigation }) {
  const [fullName, setFullName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [signupType, setSignupType] = useState('user'); // 'admin' or 'user'
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // CHANGE: Use signup function from auth context
  const { signup } = useAuth();

  const handleSignup = async () => {
    setError('');

    if (!fullName.trim()) {
      setError('Please enter your full name');
      return;
    }

    if (!workEmail.trim()) {
      setError('Please enter your work email');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(workEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    if (!password) {
      setError('Please enter a password');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!confirmPassword) {
      setError('Please confirm your password');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // CHANGE: Validate tenant name for admin signup
    if (signupType === 'admin' && !tenantName.trim()) {
      setError('Please enter your company name');
      return;
    }

    try {
      setLoading(true);
      
      // CHANGE: Use context signup method with new structure
      const signupData = {
        email: workEmail,
        password,
        signupType,
        ...(signupType === 'admin' && { tenantName }),
        ...(signupType === 'user' && tenantName && { tenantName })
      };

      const result = await signup(signupData);

      if (result.error) {
        setError(result.error);
        return;
      }

      // CHANGE: Show success message and navigate
      Alert.alert('Success', 'Account created successfully!', [
        {
          text: 'OK',
          onPress: () => {
            // Navigation handled automatically by auth state change
          },
        },
      ]);
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sign Up</Text>
      </View>

      <View style={styles.badgeContainer}>
        <View style={styles.badge}>
          <Ionicons name="sparkles" size={16} color="#4A90E2" />
          <Text style={styles.badgeText}>AI POWERED</Text>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Join the AI Revolution</Text>
        <Text style={styles.subtitle}>
          Create an account to access our intelligent FAQ and chatbot assistant.
        </Text>

        {/* CHANGE: Add signup type selector */}
        <View style={styles.signupTypeContainer}>
          <Text style={styles.label}>Account Type</Text>
          <View style={styles.signupTypeButtons}>
            <TouchableOpacity
              style={[
                styles.signupTypeButton,
                signupType === 'admin' && styles.signupTypeButtonActive
              ]}
              onPress={() => setSignupType('admin')}
            >
              <Text style={[
                styles.signupTypeButtonText,
                signupType === 'admin' && styles.signupTypeButtonTextActive
              ]}>
                Admin (Create Organization)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.signupTypeButton,
                signupType === 'user' && styles.signupTypeButtonActive
              ]}
              onPress={() => setSignupType('user')}
            >
              <Text style={[
                styles.signupTypeButtonText,
                signupType === 'user' && styles.signupTypeButtonTextActive
              ]}>
                User (Join Organization)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color="#FF6B6B" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Full Name</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Enter your full name"
              placeholderTextColor="#6B7280"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              editable={!loading}
            />
            <Ionicons name="person-outline" size={20} color="#6B7280" />
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Work Email</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="name@company.com"
              placeholderTextColor="#6B7280"
              value={workEmail}
              onChangeText={setWorkEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
            />
            <Ionicons name="mail-outline" size={20} color="#6B7280" />
          </View>
        </View>

        {/* CHANGE: Show company name field based on signup type */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>
            {signupType === 'admin' ? 'Company Name (Required)' : 'Company Name (Optional)'}
          </Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder={signupType === 'admin' ? 'Your company name' : 'Company name for auto-join'}
              placeholderTextColor="#6B7280"
              value={tenantName}
              onChangeText={setTenantName}
              autoCapitalize="words"
              editable={!loading}
            />
            <Ionicons name="business-outline" size={20} color="#6B7280" />
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Min. 8 characters"
              placeholderTextColor="#6B7280"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              editable={!loading}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                size={20}
                color="#6B7280"
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Confirm Password</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Re-enter password"
              placeholderTextColor="#6B7280"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              editable={!loading}
            />
            <TouchableOpacity
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              <Ionicons
                name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'}
                size={20}
                color="#6B7280"
              />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignup}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.buttonText}>Create Account</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.termsText}>
          By signing up, you agree to our{' '}
          <Text style={styles.link}>Terms of Service</Text> &{' '}
          <Text style={styles.link}>Privacy Policy</Text>.
        </Text>

        <View style={styles.loginContainer}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginLink}>Log In</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    marginRight: 15,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  badgeContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 226, 0.3)',
  },
  badgeText: {
    color: '#4A90E2',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  // CHANGE: Add styles for signup type selector
  signupTypeContainer: {
    marginBottom: 20,
  },
  signupTypeButtons: {
    flexDirection: 'column',
    gap: 8,
  },
  signupTypeButton: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  signupTypeButtonActive: {
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
    borderColor: '#4A90E2',
  },
  signupTypeButtonText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  signupTypeButtonTextActive: {
    color: '#4A90E2',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.3)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 8,
    fontWeight: '500',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 16,
    height: 50,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#4A90E2',
    borderRadius: 8,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  termsText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 24,
  },
  link: {
    color: '#4A90E2',
    textDecorationLine: 'underline',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  loginText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  loginLink: {
    fontSize: 14,
    color: '#4A90E2',
    fontWeight: '600',
  },
});