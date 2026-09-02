import React, { createContext, useContext, useState } from 'react';

// Context for managing tab bar visibility
const TabBarContext = createContext();

export const useTabBar = () => {
  const context = useContext(TabBarContext);
  if (!context) {
    throw new Error('useTabBar must be used within a TabBarProvider');
  }
  return context;
};

export const TabBarProvider = ({ children }) => {
  const [isForYouPlaying, setIsForYouPlaying] = useState(false);

  return (
    <TabBarContext.Provider value={{ isForYouPlaying, setIsForYouPlaying }}>
      {children}
    </TabBarContext.Provider>
  );
}; 