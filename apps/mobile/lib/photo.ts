import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

// Galeriden fotoğraf seçer, 900 piksele küçültür ve JPEG base64 olarak döndürür (yaklaşık 100 KB)
export async function pickPhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Fotoğraflara erişim izni verilmedi');
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.9 });
  if (res.canceled || !res.assets?.[0]) return null;
  const ctx = ImageManipulator.manipulate(res.assets[0].uri).resize({ width: 900 });
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
  return out.base64 ?? null;
}
