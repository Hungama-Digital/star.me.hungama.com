import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, BackHandler } from 'react-native';
import LazyImage from '../components/LazyImage';
import LottieLoader from '../components/LottieLoader';
import API from '../services/api';
import { Ionicons } from '@expo/vector-icons';

const SeriesDetailScreen = ({ route, navigation }) => {
  const { path } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [details, setDetails] = useState(null);

  useEffect(() => {
    const backAction = () => {
      navigation.goBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => sub.remove();
  }, [navigation]);

  useEffect(() => {
    if (!path) {
      setError('No series path provided.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    API.getAssetGroupDetails({ filter: JSON.stringify({ path: path }) })
      .then((data) => {
        const decodedData = API.decodeJwtToken(data);
        setDetails(decodedData.data[0]);
        setLoading(false);
      })
      .catch((err) => {
        setError('Failed to load series details.');
        setLoading(false);
      });
  }, [path]);

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="chevron-back" size={28} color="#FF6B6B" />
      </TouchableOpacity>
      {loading ? (
        <View style={styles.centered}><LottieLoader size="large" /></View>
      ) : error ? (
        <View style={styles.centered}><Text style={styles.errorText}>{error}</Text></View>
      ) : details ? (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Poster Image or Placeholder */}
          <View style={styles.imageContainer}>
            {details.horizontalFilePath || details.uploadHorizontalImage ? (
              <LazyImage
                source={{ uri: details.horizontalFilePath || details.uploadHorizontalImage }}
                style={styles.poster}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.posterPlaceholder}>
                <Text style={styles.posterPlaceholderText}>No Image</Text>
              </View>
            )}
          </View>
          {/* Title */}
          <Text style={styles.title}>{details.title || details.label}</Text>
          {/* Description */}
          <Text style={styles.description}>{details.description}</Text>
          {/* Language and Year */}
          <View style={styles.row}>
            <Text style={styles.meta}>{details.langaugeName}</Text>
            {details.productionyear && (
              <Text style={styles.meta}> | {new Date(details.productionyear).getFullYear()}</Text>
            )}
          </View>
          {/* Air Dates */}
          <View style={styles.row}>
            <Text style={styles.meta}>Aired: {details.airStartDate ? new Date(details.airStartDate).toLocaleDateString() : 'N/A'} - {details.airEndDate ? new Date(details.airEndDate).toLocaleDateString() : 'N/A'}</Text>
          </View>
          {/* Genre */}
          {details.genre && details.genre.length > 0 && (
            <View style={styles.genreRow}>
              {details.genre.map((g, i) => (
                <Text key={i} style={styles.genreTag}>{g}</Text>
              ))}
            </View>
          )}
          {/* Premium Tag */}
          {details.isPremium ? (
            <Text style={styles.premiumTag}>Premium</Text>
          ) : null}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 16 },
  jsonText: { color: '#fff', fontFamily: 'Courier', fontSize: 13 },
  errorText: { color: '#FF6B6B', fontSize: 16 },
  backButton: { padding: 16, position: 'absolute', top: 0, left: 0, zIndex: 10 },
  imageContainer: { alignItems: 'center', marginBottom: 20 },
  poster: { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#222',},
  posterPlaceholder: { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' },
  posterPlaceholderText: { color: '#888', fontSize: 16 },
  description: { color: '#fff', fontSize: 16, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  meta: { color: '#aaa', fontSize: 14 },
  genreRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  genreTag: { backgroundColor: '#333', color: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8, marginBottom: 4, fontSize: 12 },
  premiumTag: { color: '#FFD700', fontWeight: 'bold', fontSize: 15, marginTop: 10 },
});

export default SeriesDetailScreen; 