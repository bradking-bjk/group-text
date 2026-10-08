import { PermissionsAndroid, Platform } from 'react-native';
import { gatewayAvailable } from '../../modules/sms-gateway';

const PERMS = [PermissionsAndroid.PERMISSIONS.SEND_SMS, PermissionsAndroid.PERMISSIONS.RECEIVE_SMS];

export async function hasSmsPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android' || !gatewayAvailable) return false;
  const results = await Promise.all(PERMS.map((p) => PermissionsAndroid.check(p)));
  return results.every(Boolean);
}

export async function requestSmsPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android' || !gatewayAvailable) return false;
  const result = await PermissionsAndroid.requestMultiple(PERMS);
  return PERMS.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
}
