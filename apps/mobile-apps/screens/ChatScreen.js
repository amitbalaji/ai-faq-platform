import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
// CHANGE: Import useAuth hook for logout functionality
import { useAuth } from '../contexts/AuthContext';

export default function ChatScreen({ route, navigation }) {
  const { user } = route.params || {};
  const [messages, setMessages] = useState([
    {
      id: '1',
      text: "Hello! I'm your AI assistant. How can I help you today?",
      sender: 'bot',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestions: ['Reset Password', 'Pricing Info', 'Contact Support'],
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [loading, setLoading] = useState(false);
  // CHANGE: Added state for settings modal visibility
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const flatListRef = useRef(null);

  // CHANGE: Get logout function from auth context
  const { logout } = useAuth();

  useEffect(() => {
    // Scroll to bottom when messages change
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  // CHANGE: Added logout handler with confirmation
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

  const handleSend = async () => {
    if (!inputText.trim() || loading) return;

    const userMessage = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setLoading(true);

    try {
      const response = await api.chat(inputText, conversationId);

      if (response.error) {
        throw new Error(response.message || 'Failed to get response');
      }

      // Update conversation ID if this is the first message
      if (!conversationId && response.conversationId) {
        setConversationId(response.conversationId);
      }

      const botMessage = {
        id: (Date.now() + 1).toString(),
        text: response.answer || response.message || 'I apologize, but I could not process your request.',
        sender: 'bot',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'bot',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionPress = (suggestion) => {
    setInputText(suggestion);
  };

  const handleRegenerateResponse = () => {
    // Get the last user message
    const lastUserMessage = [...messages].reverse().find((msg) => msg.sender === 'user');
    if (lastUserMessage) {
      setInputText(lastUserMessage.text);
      handleSend();
    }
  };

  const renderMessage = ({ item }) => {
    const isBot = item.sender === 'bot';

    return (
      <View style={styles.messageContainer}>
        {isBot && (
          <View style={styles.botHeader}>
            <View style={styles.botAvatar}>
              <Ionicons name="chatbubbles" size={20} color="#4A90E2" />
            </View>
            <View>
              <Text style={styles.botName}>AI Assistant</Text>
              <Text style={styles.botStatus}>Online</Text>
            </View>
          </View>
        )}

        <View style={[styles.messageBubble, isBot ? styles.botBubble : styles.userBubble]}>
          <Text style={[styles.messageText, isBot ? styles.botText : styles.userText]}>
            {item.text}
          </Text>
        </View>

        <View style={styles.messageFooter}>
          <Text style={styles.timestamp}>
            {isBot ? 'AI Assistant' : 'You'} • {item.timestamp}
          </Text>
        </View>

        {/* Suggestion Buttons */}
        {isBot && item.suggestions && (
          <View style={styles.suggestionsContainer}>
            {item.suggestions.map((suggestion, index) => (
              <TouchableOpacity
                key={index}
                style={styles.suggestionButton}
                onPress={() => handleSuggestionPress(suggestion)}
              >
                <Ionicons name="refresh-outline" size={16} color="#4A90E2" />
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarContainer}>
            <Ionicons name="chatbubbles" size={24} color="#4A90E2" />
          </View>
          <View>
            <Text style={styles.headerTitle}>AI Assistant</Text>
            <Text style={styles.headerSubtitle}>Online</Text>
          </View>
        </View>
        {/* CHANGE: Added settings button that opens modal */}
        <TouchableOpacity 
          style={styles.menuButton}
          onPress={() => setShowSettingsModal(true)}
        >
          <Ionicons name="settings-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Username Display - Top Left */}
      <View style={styles.userInfo}>
        <Text style={styles.username}>{user?.name || user?.email || 'User'}</Text>
      </View>

      {/* Date Separator */}
      <View style={styles.dateSeparator}>
        <Text style={styles.dateText}>Today</Text>
      </View>

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
      />

      {/* Action Buttons */}
      {messages.length > 1 && (
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.actionButton} onPress={handleRegenerateResponse}>
            <Text style={styles.actionButtonText}>Regenerate response</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonText}>Tell me more</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input Area */}
      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.addButton}>
          <Ionicons name="add-circle-outline" size={24} color="#6B7280" />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#6B7280"
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || loading) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* Disclaimer */}
      <Text style={styles.disclaimer}>
        AI can make mistakes. Please verify important information.
      </Text>

      {/* CHANGE: Added Settings Modal */}
      <Modal
        visible={showSettingsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSettingsModal(false)}
        >
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
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
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
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 226, 0.3)',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#10B981',
    marginTop: 2,
  },
  menuButton: {
    padding: 4,
  },
  userInfo: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  username: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94A3B8',
  },
  dateSeparator: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  dateText: {
    fontSize: 12,
    color: '#6B7280',
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
  },
  messagesList: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  messageContainer: {
    marginBottom: 24,
  },
  botHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  botAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 226, 0.3)',
  },
  botName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  botStatus: {
    fontSize: 11,
    color: '#10B981',
  },
  messageBubble: {
    borderRadius: 12,
    padding: 16,
    maxWidth: '85%',
  },
  botBubble: {
    backgroundColor: '#1E293B',
    alignSelf: 'flex-start',
  },
  userBubble: {
    backgroundColor: '#4A90E2',
    alignSelf: 'flex-end',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  botText: {
    color: '#E2E8F0',
  },
  userText: {
    color: '#fff',
  },
  messageFooter: {
    marginTop: 6,
  },
  timestamp: {
    fontSize: 11,
    color: '#6B7280',
  },
  suggestionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 8,
  },
  suggestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  suggestionText: {
    fontSize: 13,
    color: '#4A90E2',
    marginLeft: 6,
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  actionButton: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  actionButtonText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  addButton: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4A90E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  disclaimer: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  // CHANGE: Added modal styles
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