import { LanguageCard, ThemeCard } from "@/components/settings/cards";
import {
  PrivateFolderCard,
  SecondFactorCard,
} from "@/components/settings/security";

export default function GeneralSettingsPage() {
  return (
    <>
      <ThemeCard />
      <LanguageCard />
      <SecondFactorCard />
      <PrivateFolderCard />
    </>
  );
}
