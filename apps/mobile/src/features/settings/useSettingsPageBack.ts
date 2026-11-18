import { useNavigation } from "@react-navigation/native";

export function useSettingsPageBack() {
  const navigation = useNavigation();
  return () => navigation.goBack();
}
