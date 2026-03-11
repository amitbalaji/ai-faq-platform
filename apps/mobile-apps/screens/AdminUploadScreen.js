import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function AdminUploadScreen({ navigation, route }) {
  const { user } = route.params || {};
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const { logout } = useAuth();

  // CHANGE: Updated logout handler with better error handling and logging
  const handleLogout = async () => {
    console.log("LOGOUT CLICKED");
  
    try {
      setShowSettingsModal(false);
  
      await logout();
  
      console.log("Logout completed");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleFilePicker = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
        copyToCacheDirectory: true,
      });

      if (result.type === 'success') {
        if (result.size > 25 * 1024 * 1024) {
          Alert.alert('File Too Large', 'Maximum file size is 25MB');
          return;
        }
        setSelectedFile(result);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      Alert.alert('No File Selected', 'Please select a file to upload');
      return;
    }

    try {
      setUploading(true);
      
      const response = await api.upload(selectedFile.name);

      if (response.error) {
        Alert.alert('Upload Failed', response.message || 'Failed to upload document');
        return;
      }

      Alert.alert('Success', 'Document uploaded successfully!', [
        {
          text: 'OK',
          onPress: () => {
            setSelectedFile(null);
            navigation.navigate('Chat', { user });
          },
        },
      ]);
    } catch (err) {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setUploading(false);
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

        <Text style={styles.headerTitle}>Upload Knowledge</Text>

        <TouchableOpacity onPress={() => setShowSettingsModal(true)}>
          <Feather name="settings" size={22} color="white" />
        </TouchableOpacity>
      </View>

      <View style={styles.textContainer}>
        <Text style={styles.title}>Add Knowledge Source</Text>
        <Text style={styles.subtitle}>
          Upload documents to train your AI chatbot.
        </Text>
      </View>

      <View style={styles.uploadCard}>
        <View style={styles.iconCircle}>
          <Feather name="upload-cloud" size={28} color="#4DA3FF" />
        </View>

        <Text style={styles.uploadText}>Tap to browse files</Text>

        <Text style={styles.supportText}>
          Support for PDF, DOCX, TXT. Max 25MB.
        </Text>

        <TouchableOpacity style={styles.button} onPress={handleFilePicker}>
          <Text style={styles.buttonText}>Select Files</Text>
        </TouchableOpacity>
      </View>

      {selectedFile && (
        <TouchableOpacity
          style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
          onPress={handleUpload}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.uploadButtonText}>Upload Document</Text>
          )}
        </TouchableOpacity>
      )}

<Modal
  visible={showSettingsModal}
  transparent
  animationType="fade"
  onRequestClose={() => setShowSettingsModal(false)}
>
  <View style={styles.modalOverlay}>

    {/* Tap outside to close */}
    <TouchableOpacity
      style={StyleSheet.absoluteFill}
      onPress={() => setShowSettingsModal(false)}
    />

    <View style={styles.modalContent}>
      <Text style={styles.modalTitle}>Settings</Text>

      <TouchableOpacity
        style={styles.modalOption}
        onPress={handleLogout}
      >
        <Ionicons name="log-out-outline" size={24} color="#FF6B6B" />
        <Text style={styles.modalOptionTextLogout}>Logout</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.modalCancelButton}
        onPress={() => setShowSettingsModal(false)}
      >
        <Text style={styles.modalCancelText}>Cancel</Text>
      </TouchableOpacity>

    </View>
  </View>
</Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#081725",
    padding: 20
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 40
  },

  headerTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "600"
  },

  textContainer: {
    marginTop: 30
  },

  title: {
    color: "white",
    fontSize: 26,
    fontWeight: "700"
  },

  subtitle: {
    color: "#8FA3B8",
    marginTop: 8
  },

  uploadCard: {
    marginTop: 30,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#35506B",
    borderRadius: 12,
    padding: 30,
    alignItems: "center",
    backgroundColor: "#0D1F33"
  },

  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#10263F",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15
  },

  uploadText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600"
  },

  supportText: {
    color: "#8FA3B8",
    marginTop: 6,
    marginBottom: 20
  },

  button: {
    backgroundColor: "#1E88E5",
    paddingVertical: 12,
    paddingHorizontal: 35,
    borderRadius: 25
  },

  buttonText: {
    color: "white",
    fontWeight: "600"
  },

  backButton: {
    width: 40,
  },

  uploadButton: {
    backgroundColor: '#4A90E2',
    borderRadius: 8,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },

  uploadButtonDisabled: {
    opacity: 0.6,
  },

  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalContent: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 320,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
  },

  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    marginBottom: 12,
  },

  modalOptionTextLogout: {
    fontSize: 16,
    color: '#FF6B6B',
    marginLeft: 12,
    fontWeight: '500',
  },

  modalCancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },

  modalCancelText: {
    fontSize: 16,
    color: '#94A3B8',
    fontWeight: '500',
  },
});