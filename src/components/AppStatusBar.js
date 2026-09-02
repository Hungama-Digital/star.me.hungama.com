import React from 'react';
import { Platform, StatusBar } from 'react-native';

/**
 * Common StatusBar component for the entire application.
 * On Android with edge-to-edge enabled, backgroundColor is not supported; omit it to avoid the warning.
 */
const AppStatusBar = ({
    barStyle = 'light-content',
    backgroundColor = 'transparent',
    translucent = true,
    hidden = false,
    ...props
}) => {
    const effectiveBackgroundColor = Platform.OS === 'android' ? undefined : backgroundColor;
    return (
        <StatusBar
            barStyle={barStyle}
            {...(effectiveBackgroundColor != null && { backgroundColor: effectiveBackgroundColor })}
            translucent={translucent}
            hidden={hidden}
            {...props}
        />
    );
};

export default AppStatusBar;
