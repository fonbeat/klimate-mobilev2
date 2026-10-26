import { Image, View } from 'react-native';
import { useV2Theme } from './theme';

const tealWordmark = require('../assets/brand/klimate-wordmark-teal.png');
const blackWordmark = require('../assets/brand/klimate-wordmark-black.png');
const darkWordmark = require('../assets/brand/klimate-wordmark-dark.png');
const aspectRatio = 380 / 1700;
const iconClipRatio = 500 / 1700;

export function BrandLogo({ width = 145 }: { width?: number }) {
  const { scheme } = useV2Theme();
  const size = { width, height: width * aspectRatio };

  if (scheme === 'dark') return <Image accessibilityLabel="Klimate" accessibilityRole="image" source={darkWordmark} resizeMode="contain" style={size} />;

  return <View accessible accessibilityLabel="Klimate" accessibilityRole="image" style={size}>
    <Image source={blackWordmark} resizeMode="contain" style={size} accessible={false} />
    <View style={{ position: 'absolute', left: 0, top: 0, width: width * iconClipRatio, height: size.height, overflow: 'hidden' }}>
      <Image source={tealWordmark} resizeMode="contain" style={size} accessible={false} />
    </View>
  </View>;
}
