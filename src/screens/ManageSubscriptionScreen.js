import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  BackHandler,
  Platform,
  StatusBar,
  Linking,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API from '../services/api';
import { useSubscription } from '../context/SubscriptionContext';
import { AppLogo } from '../components/Icons';
import SubscriptionCancelSuccessIcon from '../components/SubscriptionCancelSuccessIcon';
import analyticsService from '../services/analytics';

const CANCEL_REASONS = [
  { id: 'insufficient_funds', label: 'Insufficient funds in my account' },
  { id: 'unable_to_pause', label: 'Unable to pause my automatic payment' },
  { id: 'not_satisfied', label: 'Not satisfied with the service' },
  { id: 'others', label: 'Others (please specify)' },
];

const ManageSubscriptionScreen = ({ navigation }) => {
  const { unsubscribeUser } = useSubscription();

  const [manageDetails, setManageDetails] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showReasonDrawer, setShowReasonDrawer] = useState(false);
  const [selectedReasonId, setSelectedReasonId] = useState(null);
  const [otherReasonText, setOtherReasonText] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  /** Snapshot for success sheet (captured before refresh overwrites manageDetails) */
  const [cancelSuccessVisible, setCancelSuccessVisible] = useState(false);
  const [cancelSuccessSnapshot, setCancelSuccessSnapshot] = useState(null);

  const getUserIdFromStorage = useCallback(async () => {
    try {
      const storedUser = await AsyncStorage.getItem('user');
      if (!storedUser) return null;
      const userData = JSON.parse(storedUser);
      return (
        userData?.userId ||
        userData?.id ||
        userData?.uid ||
        userData?.user_id ||
        null
      );
    } catch (e) {
      console.error('ManageSubscription: error reading user from storage', e);
      return null;
    }
  }, []);

  const loadSubscriptionStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const userId = await getUserIdFromStorage();
      if (!userId) {
        throw new Error('Unable to find user ID');
      }

      const response = await API.checkSubscriptionStatus(userId);
      if (!response || response.success === false || !response.data?.subscriptions) {
        throw new Error(response?.error || 'Failed to load subscription details.');
      }

      const subscriptionData = response.data.subscriptions;
      const autoRenewal = response.data.auto_renewal;

      const formatShortDate = (input) => {
        if (!input) return '—';
        const date = new Date(String(input).replace(' ', 'T') + 'Z');
        if (Number.isNaN(date.getTime())) return String(input);
        return new Intl.DateTimeFormat('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(date);
      };

      setManageDetails({
        plan_name: subscriptionData.plan_name || subscriptionData.product_name,
        price: subscriptionData.plan_price,
        currency: subscriptionData.currency,
        order_id: subscriptionData.order_id,
        valid_till_display: formatShortDate(subscriptionData.subscription_end_date),
        days_remaining: subscriptionData.days_remaining,
        total_days: subscriptionData.total_days,
        subscription_status: subscriptionData.subscription_status,
        auto_renew_enabled: autoRenewal?.status === 1,
        managed_by: 'hungama',
        is_cancelled: false,
      });
    } catch (e) {
      console.error('ManageSubscription: load status error', e);
      setError(e.message || 'Failed to load subscription details.');
    } finally {
      setLoading(false);
    }
  }, [getUserIdFromStorage]);

  useEffect(() => {
    loadSubscriptionStatus();
  }, [loadSubscriptionStatus]);

  useEffect(() => {
    const onBackPress = () => {
      navigation.goBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [navigation]);

  const handleManageExternalIos = async () => {
    try {
      const RNIap = require('react-native-iap');
      await RNIap.initConnection();
      await RNIap.deepLinkToSubscriptions();
    } catch (err) {
      Linking.openURL('https://apps.apple.com/account/subscriptions');
    }
  };

  const openCancelReasonDrawer = () => {
    setSelectedReasonId(null);
    setOtherReasonText('');
    setShowReasonDrawer(true);
  };

  const closeReasonDrawer = () => {
    if (!isCancelling) setShowReasonDrawer(false);
  };

  const canProceedWithReason = () => {
    if (!selectedReasonId) return false;
    if (selectedReasonId === 'others') return otherReasonText.trim().length > 0;
    return true;
  };

  const formatShortDateFromDate = (date) => {
    if (!date || Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  };

  const closeCancelSuccessModal = () => {
    setCancelSuccessVisible(false);
    setCancelSuccessSnapshot(null);
  };

  const goHomeFromSuccess = useCallback(() => {
    setCancelSuccessVisible(false);
    setCancelSuccessSnapshot(null);
    navigation.navigate('MainTabs', { screen: 'Home' });
  }, [navigation]);

  const handleProceedCancel = async () => {
    if (!canProceedWithReason() || !manageDetails?.order_id) return;

    const reasonLabel =
      selectedReasonId === 'others'
        ? otherReasonText.trim()
        : CANCEL_REASONS.find((r) => r.id === selectedReasonId)?.label || selectedReasonId;

    try {
      await analyticsService.logSubscriptionCancelFeedback({
        reason_key: selectedReasonId,
        reason_label: reasonLabel,
        screen: 'manage_subscription',
      });
    } catch (e) {
      console.warn('subscription_cancel_feedback analytics:', e?.message);
    }

    setIsCancelling(true);
    try {
      const result = await unsubscribeUser(manageDetails.order_id, 84);
      if (result?.success) {
        const planLabel =
          !manageDetails.plan_name || manageDetails.plan_name === ''
            ? 'FastTV'
            : manageDetails.plan_name;
        const sym = manageDetails.currency || '₹';
        const pricePart = manageDetails.price != null ? manageDetails.price : '—';
        const totalDays =
          typeof manageDetails.total_days === 'number' ? manageDetails.total_days : 7;
        setCancelSuccessSnapshot({
          planName: planLabel,
          amountPaid: `${sym}${pricePart} / ${totalDays} days`,
          cancellationDate: formatShortDateFromDate(new Date()),
          accessUntil: manageDetails.valid_till_display || '—',
        });
        setShowReasonDrawer(false);
        setCancelSuccessVisible(true);
        loadSubscriptionStatus();
      } else {
        require('../utils/errorReporting').reportErrorAlert(
          'Error',
          result?.message || 'Failed to cancel automatic payment. Please try again.'
        );
      }
    } catch (e) {
      console.error('Cancel auto pay error', e);
      require('../utils/errorReporting').reportErrorAlert(
        'Error',
        'An unexpected error occurred. Please try again.'
      );
    } finally {
      setIsCancelling(false);
    }
  };

  const {
    plan_name,
    price,
    currency,
    order_id,
    valid_till_display,
    days_remaining,
    total_days,
    subscription_status,
    auto_renew_enabled,
    managed_by,
    is_cancelled,
  } = manageDetails || {};

  const isActive = subscription_status !== false && subscription_status !== 'inactive';
  /** Cancel autopay UI only when API says auto-renew is still on (Hungama-managed Android). */
  const showAndroidCancelRow =
    Platform.OS === 'android' &&
    auto_renew_enabled === true;
  /** iOS: link to store only while auto-renew is still enabled. */
  const showIosManageRow =
    Platform.OS === 'ios' && auto_renew_enabled === true;

  const progressTotal = typeof total_days === 'number' && total_days > 0 ? total_days : 1;
  const progressRemaining = typeof days_remaining === 'number' ? days_remaining : 0;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent={true}
      />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage My Subscription</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>Loading subscription…</Text>
        </View>
      ) : error ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadSubscriptionStatus}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <AppLogo width={100} height={30} />
                <Text style={styles.statusText}>
                  {is_cancelled ? 'Cancelled' : isActive ? 'Active' : 'Inactive'}
                </Text>
              </View>

              {typeof days_remaining === 'number' && (
                <>
                  <View style={styles.progressBarBackground}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.max(
                            0,
                            Math.min(
                              100,
                              ((progressTotal - progressRemaining) / progressTotal) * 100
                            )
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.remainingText}>
                    {days_remaining} day{days_remaining === 1 ? '' : 's'} remaining
                  </Text>
                </>
              )}

              <View style={[styles.detailRow, styles.firstDetailRow]}>
                <Text style={styles.detailLabel}>Subscription Plan</Text>
                <Text style={styles.detailValue}>
                  {!plan_name || plan_name === '' ? 'FastTV' : plan_name}
                </Text>
              </View>
              <View style={styles.detailRowSeparator} />

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Amount</Text>
                <Text style={styles.detailValue}>
                  {currency || '₹'} {price}
                </Text>
              </View>
              <View style={styles.detailRowSeparator} />

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Order ID</Text>
                <Text style={styles.detailValue}>{order_id}</Text>
              </View>
              <View style={styles.detailRowSeparator} />

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Subscription valid till</Text>
                <Text style={styles.detailValue}>{valid_till_display || '—'}</Text>
              </View>

              {managed_by && managed_by !== 'hungama' && (
                <Text style={styles.externalNote}>
                  This subscription is managed by {managed_by}. Use store settings to make
                  changes.
                </Text>
              )}
            </View>
          </ScrollView>

          {/* Footer: only when auto-renew allows cancel/manage; border hides when both rows hidden */}
          {!loading && !error && (showAndroidCancelRow || showIosManageRow) && (
            <View style={styles.footer}>
              <View style={styles.footerContentDimmed}>
                {showAndroidCancelRow ? (
                  <TouchableOpacity
                    style={styles.footerCancelRow}
                    onPress={openCancelReasonDrawer}
                    activeOpacity={0.7}
                  >
                    <View style={styles.footerCancelInline}>
                      <Text style={styles.footerCancelText}>Cancel Subscription ?</Text>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color="#C6C6C6"
                        style={styles.footerChevron}
                      />
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.footerCancelRow}
                    onPress={handleManageExternalIos}
                    activeOpacity={0.7}
                  >
                    <View style={styles.footerCancelInline}>
                      <Text style={styles.footerCancelText}>Manage in App Store</Text>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color="#C6C6C6"
                        style={styles.footerChevron}
                      />
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </>
      )}

      {/* Reason drawer */}
      <Modal
        visible={showReasonDrawer}
        transparent
        animationType="slide"
        onRequestClose={closeReasonDrawer}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalBackdrop}>
              <TouchableWithoutFeedback>
                <View style={styles.reasonSheet}>
                  <View style={styles.sheetHandle} />
                  <View style={styles.warningIconWrap}>
                    <Ionicons name="warning-outline" size={48} color="#FF453A" />
                  </View>
                  <Text style={styles.sheetTitle}>Cancel Subscription?</Text>
                  <Text style={styles.sheetSubtitle}>
                    Kindly provide the cancellation reason to help us serve you better
                  </Text>

                  {CANCEL_REASONS.map((item, idx) => (
                    <View key={item.id}>
                      <TouchableOpacity
                        style={styles.reasonRow}
                        onPress={() => setSelectedReasonId(item.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.reasonLabel}>{item.label}</Text>
                        <View
                          style={[
                            styles.radioOuter,
                            selectedReasonId === item.id && styles.radioOuterSelected,
                          ]}
                        >
                          {selectedReasonId === item.id ? (
                            <View style={styles.radioInner} />
                          ) : null}
                        </View>
                      </TouchableOpacity>
                      {idx < CANCEL_REASONS.length - 1 ? (
                        <View style={styles.reasonSeparator} />
                      ) : item.id === 'others' ? (
                        selectedReasonId !== 'others' ? (
                          <View style={styles.reasonSeparatorAfterOthers} />
                        ) : (
                          <View style={styles.gapAfterOthersWhenSelected} />
                        )
                      ) : null}
                    </View>
                  ))}

                  {selectedReasonId === 'others' ? (
                    <TextInput
                      style={styles.othersInput}
                      placeholder="Please specify"
                      placeholderTextColor="#666666"
                      value={otherReasonText}
                      onChangeText={setOtherReasonText}
                      multiline
                      maxLength={500}
                    />
                  ) : null}

                  <TouchableOpacity
                    style={[
                      styles.proceedBtn,
                      !canProceedWithReason() &&
                        !isCancelling &&
                        styles.proceedBtnDisabled,
                    ]}
                    disabled={!canProceedWithReason() || isCancelling}
                    onPress={handleProceedCancel}
                  >
                    {isCancelling ? (
                      <ActivityIndicator color="#000000" />
                    ) : (
                      <Text
                        style={[
                          styles.proceedBtnText,
                          !canProceedWithReason() && styles.proceedBtnTextDisabled,
                        ]}
                      >
                        Proceed
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.keepPlanBtn}
                    onPress={closeReasonDrawer}
                    disabled={isCancelling}
                  >
                    <Text style={styles.keepPlanBtnText}>Keep Plan</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* Cancel success — was only a toast before; design: bottom sheet + details */}
      <Modal
        visible={cancelSuccessVisible}
        transparent
        animationType="slide"
        onRequestClose={closeCancelSuccessModal}
      >
        <View style={styles.successModalRoot}>
          <Pressable
            style={styles.successModalBackdropPressable}
            onPress={closeCancelSuccessModal}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
          <View style={[styles.reasonSheet, styles.successSheet]}>
            <View style={styles.sheetHandle} />
            <View style={styles.successIconWrap}>
              <SubscriptionCancelSuccessIcon width={80} height={80} />
            </View>
            <Text style={styles.successTitle}>Subscription Cancelled</Text>
            <Text style={styles.successSubtitle}>
              Your subscription has been successfully cancelled.
            </Text>

            {cancelSuccessSnapshot ? (
              <View style={styles.successDetailsCard}>
                <View style={styles.successDetailRow}>
                  <Text style={styles.successDetailLabel}>Subscription Plan</Text>
                  <Text style={styles.successDetailValue}>
                    {cancelSuccessSnapshot.planName}
                  </Text>
                </View>
                <View style={styles.successDetailSeparator} />
                <View style={styles.successDetailRow}>
                  <Text style={styles.successDetailLabel}>Amount Paid</Text>
                  <Text style={styles.successDetailValue}>
                    {cancelSuccessSnapshot.amountPaid}
                  </Text>
                </View>
                <View style={styles.successDetailSeparator} />
                <View style={styles.successDetailRow}>
                  <Text style={styles.successDetailLabel}>Cancellation Date</Text>
                  <Text style={styles.successDetailValue}>
                    {cancelSuccessSnapshot.cancellationDate}
                  </Text>
                </View>
                <View style={styles.successDetailSeparator} />
                <View style={styles.successDetailRow}>
                  <Text style={styles.successDetailLabel}>Access Until</Text>
                  <Text style={styles.successDetailValue}>
                    {cancelSuccessSnapshot.accessUntil}
                  </Text>
                </View>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.successBrowseBtn}
              onPress={goHomeFromSuccess}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Browse content, go to home"
            >
              <Text style={styles.successBrowseBtnText}>Back to Home</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 70 : 30,
    paddingBottom: 12,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Product Sans',
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#CCCCCC',
  },
  errorText: {
    fontSize: 14,
    color: '#FF6B6B',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  card: {
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#333333',
    padding: 20,
    marginTop: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statusText: {
    fontFamily: 'Product Sans',
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  progressBarBackground: {
    marginTop: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333333',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#009CDB',
  },
  remainingText: {
    fontFamily: 'Product Sans',
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  firstDetailRow: {
    marginTop: 24,
  },
  detailRowSeparator: {
    height: 1,
    backgroundColor: '#333333',
    marginVertical: 4,
  },
  detailLabel: {
    fontFamily: 'Product Sans Medium',
    fontWeight: '500',
    fontSize: 15,
    color: '#FFFFFF',
  },
  detailValue: {
    fontFamily: 'Product Sans',
    fontWeight: '600',
    fontSize: 13,
    color: '#C6C6C6',
    maxWidth: '55%',
    textAlign: 'right',
  },
  externalNote: {
    marginTop: 16,
    fontSize: 13,
    color: '#AAAAAA',
    lineHeight: 18,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 20,
    backgroundColor: '#000000',
  },
  footerContentDimmed: {
    opacity: 0.5,
  },
  footerCancelRow: {
    paddingVertical: 8,
  },
  footerCancelInline: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  footerCancelText: {
    fontFamily: 'Product Sans Medium',
    fontWeight: '500',
    fontSize: 15,
    color: '#C6C6C6',
  },
  footerChevron: {
    marginLeft: 4,
  },
  modalRoot: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  reasonSheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    paddingTop: 8,
    maxHeight: '92%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#444444',
    marginBottom: 12,
  },
  warningIconWrap: {
    alignItems: 'center',
    marginBottom: 8,
  },
  sheetTitle: {
    fontFamily: 'Product Sans',
    fontSize: 23,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  sheetSubtitle: {
    fontFamily: 'Product Sans',
    fontSize: 15,
    fontWeight: '400',
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  reasonLabel: {
    flex: 1,
    fontFamily: 'Product Sans Medium',
    fontSize: 15,
    fontWeight: '500',
    color: '#FFFFFF',
    paddingRight: 12,
  },
  reasonSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#333333',
  },
  /** Line + extra space after “Others” when another reason is selected */
  reasonSeparatorAfterOthers: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#333333',
    marginBottom: 50,
  },
  /** Extra space after “Others” when it’s selected (text field follows; no line) */
  gapAfterOthersWhenSelected: {
    height: 14,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#666666',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: '#FFFFFF',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  othersInput: {
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    minHeight: 88,
    padding: 12,
    color: '#FFFFFF',
    fontFamily: 'Product Sans',
    fontSize: 15,
    fontWeight: '400',
    marginBottom: 16,
    textAlignVertical: 'top',
  },
  /** Figma: 327×54; enabled = white fill, disabled = medium gray fill + dark label */
  proceedBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  proceedBtnDisabled: {
    backgroundColor: '#636366',
  },
  proceedBtnText: {
    fontFamily: 'Product Sans',
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  proceedBtnTextDisabled: {
    fontFamily: 'Product Sans',
    color: '#1C1C1E',
  },
  keepPlanBtn: {
    backgroundColor: '#636366',
    borderWidth: 1,
    borderColor: '#636366',
    borderRadius: 14,
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keepPlanBtnText: {
    fontFamily: 'Product Sans',
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  successModalRoot: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  successModalBackdropPressable: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  successSheet: {
    paddingTop: 4,
  },
  successIconWrap: {
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontFamily: 'Product Sans',
    fontSize: 23,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  successSubtitle: {
    fontFamily: 'Product Sans',
    fontSize: 15,
    fontWeight: '400',
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  successDetailsCard: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 24,
  },
  successDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  successDetailSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#3A3A3C',
  },
  successDetailLabel: {
    fontFamily: 'Product Sans Medium',
    fontSize: 15,
    fontWeight: '500',
    color: '#FFFFFF',
    flex: 1,
    paddingRight: 12,
  },
  successDetailValue: {
    fontFamily: 'Product Sans',
    fontSize: 13,
    fontWeight: '600',
    color: '#C6C6C6',
    maxWidth: '55%',
    textAlign: 'right',
  },
  successBrowseBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successBrowseBtnText: {
    fontFamily: 'Product Sans',
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
});

export default ManageSubscriptionScreen;
