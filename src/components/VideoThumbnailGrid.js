import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlatGrid } from 'react-native-super-grid';
import VideoThumbnail from './VideoThumbnail';

const VideoThumbnailGrid = ({ data, onVideoPress, title = "Discover Videos" }) => {
  const renderVideoItem = ({ item }) => (
    <VideoThumbnail video={item} onPress={onVideoPress} />
  );

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <FlatGrid
        itemDimension={150} // Minimum item width
        data={data}
        style={styles.gridList}
        spacing={10}
        renderItem={renderVideoItem}
        staticDimension={null}
        maxItemsPerRow={3}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.gridContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginLeft: 20,
    marginBottom: 15,
    marginTop: 10,
  },
  gridList: {
    flex: 1,
  },
  gridContent: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
});

export default VideoThumbnailGrid; 