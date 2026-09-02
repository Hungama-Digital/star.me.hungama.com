import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, Path } from 'react-native-svg';

const PaymentFeedbackContext = createContext(null);

export const usePaymentFeedback = () => {
  const ctx = useContext(PaymentFeedbackContext);
  if (!ctx) {
    throw new Error(
      'usePaymentFeedback must be used within a PaymentFeedbackProvider'
    );
  }
  return ctx;
};

const DEFAULT_MESSAGE =
  'If amount was deducted it will be refunded,\nwithin 2 hours';

export const PaymentFeedbackProvider = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('Payment Failed');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [variant, setVariant] = useState('error'); // 'error' | 'success'
  const [planLabel, setPlanLabel] = useState('');
  const [amountLabel, setAmountLabel] = useState('');
  const [orderIdLabel, setOrderIdLabel] = useState('');
  const [validTillLabel, setValidTillLabel] = useState('');
  const [retryHandler, setRetryHandler] = useState(null);
  const [cancelHandler, setCancelHandler] = useState(null);
  const [primaryHandler, setPrimaryHandler] = useState(null);
  // When true, Subscription screen must not auto-redirect on isGoldUser (IAP success popup will handle navigation).
  const [skipSubscriptionRedirectForIap, setSkipSubscriptionRedirectForIap] = useState(false);

  const registerPaymentAttempt = useCallback(
    ({ onRetry, onCancel } = {}) => {
      setRetryHandler(() => (typeof onRetry === 'function' ? onRetry : null));
      setCancelHandler(() =>
        typeof onCancel === 'function' ? onCancel : null
      );
    },
    []
  );

  const showPaymentFailed = useCallback(
    (options = {}) => {
      const {
        title: customTitle,
        message: customMessage,
        plan,
        amount,
        orderId,
      } = options;
      setVariant('error');
      setTitle(customTitle || 'Payment Failed');
      setMessage(customMessage || DEFAULT_MESSAGE);
      setPlanLabel(plan || 'FastTV');
      setAmountLabel(amount || '₹399 / 3 months');
      setOrderIdLabel(orderId || '');
      setValidTillLabel('');
      setPrimaryHandler(null);
      setVisible(true);
    },
    []
  );

  const showPaymentSuccess = useCallback(
    (options = {}) => {
      const {
        title: customTitle,
        message: customMessage,
        onPrimary,
        plan,
        amount,
        orderId,
        validTill,
      } = options;
      setVariant('success');
      setTitle(customTitle || 'Payment Successful');
      setMessage(customMessage || DEFAULT_MESSAGE);
      setPlanLabel(plan || '');
      setAmountLabel(amount || '');
      setOrderIdLabel(orderId || '');
      setValidTillLabel(validTill || '');
      setPrimaryHandler(() =>
        typeof onPrimary === 'function' ? onPrimary : null
      );
      setVisible(true);
    },
    []
  );

  const hidePaymentPopup = useCallback(() => {
    setVisible(false);
  }, []);

  const handleRetryPress = useCallback(() => {
    if (variant === 'success') {
      const primary = primaryHandler;
      hidePaymentPopup();
      if (typeof primary === 'function') {
        primary();
      }
      return;
    }

    const retry = retryHandler;
    hidePaymentPopup();
    if (typeof retry === 'function') {
      retry();
    }
  }, [hidePaymentPopup, retryHandler, primaryHandler, variant]);

  const handleCancelPress = useCallback(() => {
    hidePaymentPopup();
  }, [cancelHandler, hidePaymentPopup]);

  const value = useMemo(
    () => ({
      visible,
      title,
      message,
      planLabel,
      amountLabel,
      orderIdLabel,
      validTillLabel,
      showPaymentFailed,
      showPaymentSuccess,
      hidePaymentPopup,
      registerPaymentAttempt,
      skipSubscriptionRedirectForIap,
      setSkipSubscriptionRedirectForIap,
    }),
    [
      visible,
      title,
      message,
      planLabel,
      amountLabel,
      orderIdLabel,
      validTillLabel,
      showPaymentFailed,
      showPaymentSuccess,
      hidePaymentPopup,
      registerPaymentAttempt,
      skipSubscriptionRedirectForIap,
    ]
  );

  return (
    <PaymentFeedbackContext.Provider value={value}>
      {children}

      <Modal
        visible={visible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={hidePaymentPopup}
      >
        <TouchableWithoutFeedback onPress={hidePaymentPopup}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.sheetContainer}>
                <View style={styles.sheetHandle} />
                <View style={styles.iconWrapper}>
                  {variant === 'success' ? (
                    <Svg width={48} height={48} viewBox="0 0 48 48" fill="none">
                      <Rect
                        opacity="0.1"
                        width={48}
                        height={48}
                        rx={24}
                        fill="#6AC544"
                      />
                      <Rect
                        x={6}
                        y={6}
                        width={36}
                        height={36}
                        rx={18}
                        fill="#6AC544"
                      />
                      <Path
                        d="M17.3281 24.2565L21.6041 28.532L30.6681 19.468"
                        stroke="white"
                        strokeWidth={3}
                      />
                    </Svg>
                  ) : (
                    <Ionicons
                      name="warning-outline"
                      size={40}
                      color="#FF4D4F"
                    />
                  )}
                </View>
                <Text style={styles.titleText}>{title}</Text>
                <Text style={styles.messageText}>{message}</Text>

                {variant === 'error' && (
                  <View style={styles.detailsContainer}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Subscription Plan</Text>
                      <Text style={styles.detailValue}>
                        {planLabel || 'FastTV'}
                      </Text>
                    </View>
                    <View style={styles.detailDivider} />
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Amount</Text>
                      <Text style={styles.detailValue}>
                        {amountLabel || '₹399 / 3 months'}
                      </Text>
                    </View>
                    <View style={styles.detailDivider} />
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Order ID</Text>
                      <Text
                        style={[styles.detailValue, styles.detailOrderId]}
                        numberOfLines={1}
                        ellipsizeMode="middle"
                      >
                        {orderIdLabel || '—'}
                      </Text>
                    </View>
                  </View>
                )}

                {variant === 'success' && (
                  <View style={styles.detailsContainer}>
                    <View className="row-plan" style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Subscription Plan</Text>
                      <Text style={styles.detailValue}>
                        {planLabel || 'FastTV'}
                      </Text>
                    </View>
                    <View style={styles.detailDivider} />
                    <View className="row-amount" style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Amount</Text>
                      <Text style={styles.detailValue}>
                        {amountLabel || '₹399 / 3 months'}
                      </Text>
                    </View>
                    <View style={styles.detailDivider} />
                    <View className="row-order" style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Order ID</Text>
                      <Text
                        style={[styles.detailValue, styles.detailOrderId]}
                        numberOfLines={1}
                        ellipsizeMode="middle"
                      >
                        {orderIdLabel || '—'}
                      </Text>
                    </View>
                    <View style={styles.detailDivider} />
                    <View className="row-valid-till" style={styles.detailRow}>
                      <Text style={styles.detailLabel}>
                        Subscription valid till
                      </Text>
                      <Text style={styles.detailValue}>
                        {validTillLabel || '—'}
                      </Text>
                    </View>
                  </View>
                )}

                {variant === 'success' ? <TouchableOpacity
                  style={styles.primaryButton}
                  activeOpacity={0.9}
                  onPress={handleRetryPress}
                >
                  <Image
                    source={require('../../assets/HomeBlack.png')}
                    style={styles.buttonIcon}
                  />
                  <Text style={styles.primaryButtonText}>
                    Start Watching
                  </Text>
                </TouchableOpacity> : 
                <TouchableOpacity
                  style={styles.primaryButton}
                  activeOpacity={0.9}
                  onPress={handleRetryPress}
                >
                  <Text style={styles.primaryButtonText}>
                    Retry payment
                  </Text>
                </TouchableOpacity>}

                {variant === 'error' && (
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    activeOpacity={0.8}
                    onPress={handleCancelPress}
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </PaymentFeedbackContext.Provider>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#111111',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    alignItems: 'center',
  },
  sheetHandle: {
    width: 56,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#444444',
    marginBottom: 30,
  },
  iconWrapper: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  successIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(11, 191, 77, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: 'Product Sans',
  },
  messageText: {
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
    opacity: 0.6,
    fontWeight: 400,
    fontFamily: 'Product Sans',
  },
  primaryButton: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Product Sans',
  },
  secondaryButton: {
    width: '100%',
    backgroundColor: '#2B2B2B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    opacity: 0.7,
    fontFamily: 'Product Sans',
  },
  buttonIcon: {
    marginRight: 10,
    width: 20,
    height: 20,
  },
  detailsContainer: {
    width: '100%',
    marginTop: 8,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  detailLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.7,
    fontFamily: 'Product Sans',
  },
  detailValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Product Sans',
  },
  detailOrderId: {
    maxWidth: '55%',
  },
  detailDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
});

